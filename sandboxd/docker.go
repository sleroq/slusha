package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"slusha/sandboxd/internal/firewall"
)

const archiveLimit = 25_000_000
const outputLimit = 64 * 1024
const commandOutputLimit = 1024 * 1024

var processEnv = []string{"PATH=" + os.Getenv("PATH"), "DOCKER_HOST=unix:///var/run/docker.sock", "DOCKER_CONFIG=/nonexistent"}

type cappedOutput struct {
	mu             sync.Mutex
	stdout, stderr bytes.Buffer
	total          int
	exceeded       bool
	cancel         context.CancelFunc
}
type outputWriter struct {
	output *cappedOutput
	stdout bool
}

func (w outputWriter) Write(p []byte) (int, error) {
	w.output.mu.Lock()
	defer w.output.mu.Unlock()
	w.output.total += len(p)
	if w.output.cancel != nil && w.output.total > commandOutputLimit {
		w.output.exceeded = true
		w.output.cancel()
	}
	dst := &w.output.stderr
	if w.stdout {
		dst = &w.output.stdout
	}
	n := min(len(p), max(0, outputLimit-dst.Len()))
	_, _ = dst.Write(p[:n])
	return len(p), nil
}

func docker(ctx context.Context, input io.Reader, output io.Writer, limit bool, args ...string) (string, string, int, bool, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Env = processEnv
	cmd.Stdin = input
	captured := &cappedOutput{}
	if limit {
		captured.cancel = cancel
	}
	if output != nil {
		cmd.Stdout = output
	} else {
		cmd.Stdout = outputWriter{captured, true}
	}
	cmd.Stderr = outputWriter{captured, false}
	err := cmd.Run()
	code := 0
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			code = exit.ExitCode()
		} else {
			return "", "", 0, false, err
		}
	}
	return captured.stdout.String(), captured.stderr.String(), code, captured.exceeded, err
}
func checked(ctx context.Context, input io.Reader, output io.Writer, args ...string) (string, error) {
	stdout, stderr, _, _, err := docker(ctx, input, output, false, args...)
	if err != nil {
		return "", fmt.Errorf("docker %s failed: %s: %w", args[0], stderr, err)
	}
	return stdout, nil
}
func preflight(ctx context.Context, image string) error {
	if err := firewall.Check(ctx); err != nil {
		return fmt.Errorf("firewall: %w", err)
	}
	info, err := checked(ctx, nil, nil, "info", "--format",
		`{{if index .Runtimes "runsc"}}ok{{end}} {{.MemoryLimit}} {{.SwapLimit}} {{.PidsLimit}} {{.CPUCfsQuota}}`)
	if err != nil {
		return err
	}
	if strings.TrimSpace(info) != "ok true true true true" {
		return errors.New("runsc or required cgroup controllers unavailable")
	}
	label, err := checked(ctx, nil, nil, "image", "inspect", "--format",
		`{{index .Config.Labels "org.slusha.sandbox"}}`, image)
	if err != nil {
		return err
	}
	if strings.TrimSpace(label) != "1" {
		return errors.New("invalid sandbox image label")
	}
	return nil
}
func cleanupManaged(ctx context.Context) error {
	ids, err := checked(ctx, nil, nil, "ps", "-aq", "--filter", "label=org.slusha.managed=1")
	if err != nil {
		return err
	}
	list := strings.Fields(ids)
	if len(list) == 0 {
		return nil
	}
	for _, id := range list {
		if len(id) != 12 && len(id) != 64 {
			return errors.New("invalid docker container id")
		}
		if _, err := hex.DecodeString(id); err != nil {
			return errors.New("invalid docker container id")
		}
	}
	_, err = checked(ctx, nil, nil, append([]string{"rm", "-f"}, list...)...)
	return err
}
func randomName() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return "slusha-" + hex.EncodeToString(b[:]), nil
}
func removeContainer(ctx context.Context, name string) error {
	_, _, _, _, _ = docker(ctx, nil, nil, false, "rm", "-f", name)
	out, err := checked(ctx, nil, nil, "ps", "-aq", "--filter", "name=^/"+name+"$")
	if err != nil {
		return err
	}
	if strings.TrimSpace(out) != "" {
		return errors.New("container removal failed")
	}
	return nil
}
func startWatchdog(name, dir string, deadline time.Time) (*os.Process, error) {
	exe, err := os.Executable()
	if err != nil {
		return nil, err
	}
	cmd := exec.Command(exe, "watchdog", name, dir, strconv.FormatInt(deadline.Add(10*time.Second).UnixNano(), 10))
	cmd.Env = processEnv
	cmd.SysProcAttr = detachedProcess()
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	return cmd.Process, nil
}
func watchdog(args []string) error {
	if len(args) != 3 || !validName(args[0]) || args[1] != filepath.Join("/tmp", args[0]) {
		return errors.New("invalid watchdog arguments")
	}
	deadline, err := strconv.ParseInt(args[2], 10, 64)
	if err != nil {
		return err
	}
	time.Sleep(max(0, time.Until(time.Unix(0, deadline))))
	for {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		err = removeContainer(ctx, args[0])
		cancel()
		if err == nil {
			break
		}
		time.Sleep(time.Second)
	}
	return os.RemoveAll(args[1])
}
func validName(name string) bool {
	if !strings.HasPrefix(name, "slusha-") || len(name) != 39 {
		return false
	}
	_, err := hex.DecodeString(name[7:])
	return err == nil
}

type executionResult struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exitCode"`
	Archive  []byte `json:"archive,omitempty"`
}
type boundedArchive struct{ bytes.Buffer }

func (b *boundedArchive) Write(p []byte) (int, error) {
	if len(p) > archiveLimit-b.Len() {
		return 0, errors.New("workspace archive exceeds limit")
	}
	return b.Buffer.Write(p)
}
func execute(ctx context.Context, image, command string, archive []byte) (result executionResult, err error) {
	if err := preflight(ctx, image); err != nil {
		return result, err
	}

	name, err := randomName()
	if err != nil {
		return result, err
	}
	dir := filepath.Join("/tmp", name)
	if err := os.Mkdir(dir, 0700); err != nil {
		return result, err
	}
	resolver := filepath.Join(dir, "resolv.conf")
	if err := os.WriteFile(resolver, []byte("nameserver 1.1.1.1\n"), 0444); err != nil {
		_ = os.RemoveAll(dir)
		return result, err
	}

	deadline, _ := ctx.Deadline()
	guard, err := startWatchdog(name, dir, deadline)
	if err != nil {
		_ = os.RemoveAll(dir)
		return result, err
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if cleanupErr := removeContainer(cleanup, name); cleanupErr != nil {
			result = executionResult{}
			err = fmt.Errorf("remove sandbox container: %w", cleanupErr)
			_, _ = guard.Wait()
		} else {
			_ = guard.Kill()
			_ = os.RemoveAll(dir)
			go func() { _, _ = guard.Wait() }()
		}
	}()

	size := (archiveLimit - 1) / os.Getpagesize() * os.Getpagesize()
	_, err = checked(ctx, nil, nil, "create", "--rm",
		"--label", "org.slusha.managed=1", "--name", name,
		"--runtime=runsc", "--network=slusha-gvisor",
		"--mount", "type=bind,source="+resolver+",target=/etc/resolv.conf,readonly",
		"--read-only", "--user=1000:1000", "--cap-drop=ALL",
		"--security-opt=no-new-privileges", "--log-driver=none",
		"--memory=128m", "--memory-swap=128m", "--cpus=0.5", "--pids-limit=64",
		"--ulimit=nofile=256:256", "--tmpfs",
		fmt.Sprintf("/workspace:rw,nosuid,nodev,exec,size=%d,uid=1000,gid=1000,mode=0700", size),
		"--tmpfs", "/tmp:rw,nosuid,nodev,exec,size=8388608,uid=1000,gid=1000,mode=0700",
		"--workdir=/workspace", "--entrypoint=/bin/sh", image, "-c", "sleep 135")
	if err != nil {
		return result, err
	}
	if _, err = checked(ctx, nil, nil, "start", name); err != nil {
		return result, err
	}
	if archive != nil {
		if _, err = checked(ctx, bytes.NewReader(archive), nil, "exec", "-i", name,
			"tar", "--no-same-owner", "--no-same-permissions", "-xf", "-", "-C", "/workspace"); err != nil {
			return result, err
		}
	}

	stdout, stderr, code, exceeded, runErr := docker(ctx, nil, nil, true, "exec", name, "/bin/sh", "-c", command)
	result = executionResult{Stdout: stdout, Stderr: stderr, ExitCode: code}
	if exceeded {
		result.ExitCode = 125
		result.Stderr += "\nSandbox output limit exceeded; workspace changes discarded."
		return result, nil
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		result.ExitCode = 124
		result.Stderr += "\nSandbox timed out; workspace changes discarded."
		return result, nil
	}
	if ctx.Err() != nil {
		return result, ctx.Err()
	}
	if runErr != nil && code < 0 {
		return result, runErr
	}
	if runErr != nil {
		var exit *exec.ExitError
		if !errors.As(runErr, &exit) {
			return result, runErr
		}
	}

	var out boundedArchive
	if _, err = checked(ctx, nil, &out, "exec", name, "tar", "--sparse", "-cf", "-", "-C", "/workspace", "."); err != nil {
		return result, err
	}
	result.Archive = out.Bytes()
	return result, nil
}
