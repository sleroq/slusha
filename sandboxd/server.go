package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type request struct {
	command string
	timeout time.Duration
	archive []byte
}

func decodeRequest(w http.ResponseWriter, r *http.Request) (request, error) {
	var input struct {
		Command   *string `json:"command"`
		TimeoutMs *int    `json:"timeoutMs"`
		Archive   []byte  `json:"archive"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 34_000_000))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&input); err != nil {
		return request{}, errors.New("invalid request")
	}
	var extra json.RawMessage
	if err := dec.Decode(&extra); err != io.EOF {
		return request{}, errors.New("invalid trailing JSON")
	}
	if input.Command == nil || strings.IndexByte(*input.Command, 0) >= 0 {
		return request{}, errors.New("invalid command")
	}
	if input.TimeoutMs == nil || *input.TimeoutMs < 1 || *input.TimeoutMs > 120000 {
		return request{}, errors.New("invalid timeoutMs")
	}
	if len(input.Archive) > archiveLimit {
		return request{}, errors.New("invalid archive")
	}
	return request{
		command: *input.Command,
		timeout: time.Duration(*input.TimeoutMs) * time.Millisecond,
		archive: input.Archive,
	}, nil
}
func envDefault(key, value string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return value
}
func protectedParent(path string) error {
	dir := filepath.Dir(path)
	if !filepath.IsAbs(path) || filepath.Clean(path) != path || filepath.Base(path) == "." {
		return errors.New("socket path must be absolute and clean")
	}
	oldMask := syscall.Umask(0022)
	err := os.MkdirAll(dir, 0755)
	syscall.Umask(oldMask)
	if err != nil {
		return err
	}
	for {
		info, err := os.Lstat(dir)
		if err != nil {
			return err
		}
		stat, ok := info.Sys().(*syscall.Stat_t)
		if !ok || !info.IsDir() || stat.Uid != 0 || info.Mode().Perm()&0022 != 0 {
			return fmt.Errorf("unsafe socket directory: %s", dir)
		}
		if dir == "/" {
			break
		}
		dir = filepath.Dir(dir)
	}
	return nil
}
func listenSocket(path, group string) (net.Listener, error) {
	if os.Geteuid() != 0 {
		return nil, errors.New("sandboxd must run as root")
	}
	if err := protectedParent(path); err != nil {
		return nil, err
	}

	grp, err := user.LookupGroup(group)
	if err != nil {
		return nil, err
	}
	gid, err := strconv.Atoi(grp.Gid)
	if err != nil {
		return nil, err
	}

	info, err := os.Lstat(path)
	if err == nil {
		st, ok := info.Sys().(*syscall.Stat_t)
		if !ok || info.Mode()&os.ModeSocket == 0 || st.Uid != 0 || int(st.Gid) != gid || info.Mode().Perm() != 0660 {
			return nil, errors.New("unsafe existing socket")
		}
		conn, dialErr := net.DialTimeout("unix", path, time.Second)
		if dialErr == nil {
			_ = conn.Close()
			return nil, errors.New("socket already in use")
		}
		if !errors.Is(dialErr, syscall.ECONNREFUSED) {
			return nil, fmt.Errorf("cannot establish socket state: %w", dialErr)
		}
		if err := os.Remove(path); err != nil {
			return nil, err
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}

	oldMask := syscall.Umask(0077)
	listener, err := net.Listen("unix", path)
	syscall.Umask(oldMask)
	if err != nil {
		return nil, err
	}
	if err = os.Chown(path, 0, gid); err == nil {
		err = os.Chmod(path, 0660)
	}
	if err != nil {
		_ = listener.Close()
		return nil, err
	}
	return listener, nil
}
func serve(ctx context.Context) error {
	image := envDefault("SANDBOX_IMAGE", "slusha-sandbox")
	if strings.HasPrefix(image, "-") || strings.ContainsAny(image, "\x00\r\n") {
		return errors.New("invalid image")
	}

	socket := envDefault("SLUSHA_SANDBOX_SOCKET", "/run/slusha-gvisor/sandbox.sock")
	group := envDefault("SLUSHA_SANDBOX_GROUP", "root")
	listener, err := listenSocket(socket, group)
	if err != nil {
		return err
	}
	defer func() { _ = listener.Close() }()

	startup, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()
	if err := cleanupManaged(startup); err != nil {
		return err
	}
	if err := preflight(startup, image); err != nil {
		return err
	}

	server := &http.Server{
		Handler:           sandboxHandler(image),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       120 * time.Second,
		BaseContext:       func(net.Listener) context.Context { return ctx },
	}
	shutdownDone := make(chan struct{})
	go func() {
		defer close(shutdownDone)
		<-ctx.Done()
		shutdown, stop := context.WithTimeout(context.Background(), 15*time.Second)
		defer stop()
		_ = server.Shutdown(shutdown)
	}()
	err = server.Serve(listener)
	if errors.Is(err, http.ErrServerClosed) {
		<-shutdownDone
		return nil
	}
	return err
}

func sandboxHandler(image string) http.Handler {
	slots := make(chan struct{}, 4)
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		select {
		case slots <- struct{}{}:
			defer func() { <-slots }()
		default:
			http.Error(w, "sandbox busy", http.StatusServiceUnavailable)
			return
		}
		check, done := context.WithTimeout(r.Context(), 10*time.Second)
		defer done()
		if err := preflight(check, image); err != nil {
			log.Printf("sandbox health: %v", err)
			http.Error(w, "sandbox unavailable", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "OK\n")
	})

	mux.HandleFunc("/execute", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		select {
		case slots <- struct{}{}:
			defer func() { <-slots }()
		default:
			http.Error(w, "sandbox busy", http.StatusServiceUnavailable)
			return
		}
		controller := http.NewResponseController(w)
		if err := controller.SetReadDeadline(time.Now().Add(10 * time.Second)); err != nil {
			http.Error(w, "sandbox unavailable", http.StatusServiceUnavailable)
			return
		}
		req, err := decodeRequest(w, r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := controller.SetReadDeadline(time.Time{}); err != nil {
			http.Error(w, "sandbox unavailable", http.StatusServiceUnavailable)
			return
		}
		work, done := context.WithTimeout(r.Context(), req.timeout)
		defer done()
		result, err := execute(work, image, req.command, req.archive)
		if err != nil {
			log.Printf("sandbox execution: %v", err)
			if errors.Is(work.Err(), context.DeadlineExceeded) {
				http.Error(w, "execution timed out", http.StatusGatewayTimeout)
			} else {
				http.Error(w, "sandbox execution failed", http.StatusServiceUnavailable)
			}
			return
		}
		if err := controller.SetWriteDeadline(time.Now().Add(10 * time.Second)); err != nil {
			log.Printf("sandbox response: %v", err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(result)
	})

	return mux
}
