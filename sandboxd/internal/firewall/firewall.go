// Package firewall provisions and verifies the dedicated sandbox bridge policy.
package firewall

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"os"
	"os/exec"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	networkName = "slusha-gvisor"
	bridge      = "br-slusha-gv"
	chain       = "SLUSHA-GVISOR"
	subnet      = "172.30.250.0/24"
	blockedFile = "/etc/slusha-gvisor/blocked-cidrs"
)

var reserved = []string{"0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4"}

type network struct {
	Name       string
	Driver     string
	Internal   *bool
	EnableIPv6 *bool
	Options    map[string]string
	IPAM       struct{ Config []struct{ Subnet string } }
}

func run(ctx context.Context, tool string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, tool, args...)
	cmd.Env = []string{
		"PATH=" + os.Getenv("PATH"),
		"DOCKER_HOST=unix:///var/run/docker.sock",
		"DOCKER_CONFIG=/nonexistent",
	}
	var stderr strings.Builder
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		if ctx.Err() != nil {
			err = ctx.Err()
		}
		return "", fmt.Errorf("%s %s: %w: %s", tool, strings.Join(args, " "), err, strings.TrimSpace(stderr.String()))
	}
	return strings.TrimSpace(string(out)), nil
}

func inspectNetworks(ctx context.Context) ([]network, error) {
	ids, err := run(ctx, "docker", "network", "ls", "-q")
	if err != nil {
		return nil, err
	}
	args := append([]string{"network", "inspect"}, strings.Fields(ids)...)
	output, err := run(ctx, "docker", args...)
	if err != nil {
		return nil, err
	}
	var networks []network
	if err := json.Unmarshal([]byte(output), &networks); err != nil {
		return nil, fmt.Errorf("decode Docker networks: %w", err)
	}
	return networks, nil
}

func validateNetwork(ctx context.Context, networks []network) error {
	var found *network
	for i := range networks {
		if networks[i].Name == networkName {
			if found != nil {
				return errors.New("dedicated Docker network is missing")
			}
			found = &networks[i]
		}
	}
	if found == nil {
		return errors.New("dedicated Docker network is missing")
	}
	if found.Driver != "bridge" || found.Internal == nil || *found.Internal || found.EnableIPv6 == nil || *found.EnableIPv6 || found.Options["com.docker.network.bridge.name"] != bridge || len(found.IPAM.Config) != 1 || found.IPAM.Config[0].Subnet != subnet {
		return errors.New("dedicated Docker network configuration does not match")
	}
	output, err := run(ctx, "ip", "-j", "-d", "link", "show", bridge)
	if err != nil {
		return err
	}
	var links []struct {
		Flags    []string `json:"flags"`
		LinkInfo struct {
			Kind string `json:"info_kind"`
		} `json:"linkinfo"`
	}
	if err := json.Unmarshal([]byte(output), &links); err != nil {
		return fmt.Errorf("decode bridge link: %w", err)
	}
	if len(links) != 1 || links[0].LinkInfo.Kind != "bridge" || !slices.Contains(links[0].Flags, "UP") {
		return errors.New("dedicated bridge is missing or down")
	}
	return nil
}

// parseNetwork accepts host addresses and IPv4 netmasks as well as CIDR notation.
func parseNetwork(value string, strict bool) (netip.Prefix, error) {
	p, err := netip.ParsePrefix(value)
	if err != nil {
		address, mask, hasMask := strings.Cut(value, "/")
		addr, addrErr := netip.ParseAddr(address)
		if addrErr == nil && !hasMask {
			p, err = netip.PrefixFrom(addr, addr.BitLen()), nil
		} else if addrErr == nil && addr.Is4() {
			ip := net.ParseIP(mask).To4()
			if ip != nil {
				bits, size := net.IPMask(ip).Size()
				if size == 0 {
					for i := range ip {
						ip[i] = ^ip[i]
					}
					bits, size = net.IPMask(ip).Size()
				}
				if size != 0 {
					p, err = netip.PrefixFrom(addr, bits), nil
				}
			}
		}
	}

	if err != nil {
		return netip.Prefix{}, fmt.Errorf("invalid network %q: %w", value, err)
	}
	if strict && p != p.Masked() {
		return netip.Prefix{}, fmt.Errorf("network %q has host bits set", value)
	}
	return p.Masked(), nil
}

func expectedRules(ctx context.Context, networks []network) ([]string, error) {
	prefixes, err := reservedAndRoutePrefixes(ctx)
	if err != nil {
		return nil, err
	}
	prefixes, err = explicitBlockedPrefixes(prefixes)
	if err != nil {
		return nil, err
	}
	prefixes, err = dockerPrefixes(prefixes, networks)
	if err != nil {
		return nil, err
	}

	prefixes = collapse(prefixes)
	rules := []string{fmt.Sprintf("-A %s -o %s -j DROP", chain, bridge)}
	for _, p := range prefixes {
		rules = append(rules, fmt.Sprintf("-A %s -d %s -j DROP", chain, p))
	}
	return append(rules, "-A "+chain+" -j RETURN"), nil
}

func reservedAndRoutePrefixes(ctx context.Context) ([]netip.Prefix, error) {
	prefixes := make([]netip.Prefix, 0, len(reserved))
	add := func(value string) error {
		p, err := parseNetwork(value, false)
		if err != nil {
			return err
		}
		if !p.Addr().Is4() {
			return fmt.Errorf("expected IPv4 network: %s", value)
		}
		prefixes = append(prefixes, p)
		return nil
	}

	for _, value := range reserved {
		if err := add(value); err != nil {
			return nil, err
		}
	}

	output, err := run(ctx, "ip", "-j", "-4", "route", "show", "table", "all")
	if err != nil {
		return nil, err
	}
	var routes []struct {
		Destination string `json:"dst"`
	}
	if err := json.Unmarshal([]byte(output), &routes); err != nil {
		return nil, fmt.Errorf("decode routes: %w", err)
	}
	for _, route := range routes {
		if route.Destination != "" && route.Destination != "default" {
			if err := add(route.Destination); err != nil {
				return nil, fmt.Errorf("route: %w", err)
			}
		}
	}

	return prefixes, nil
}

func explicitBlockedPrefixes(prefixes []netip.Prefix) ([]netip.Prefix, error) {
	data, err := os.ReadFile(blockedFile)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", blockedFile, err)
	}
	var entries []string
	for line := range strings.SplitSeq(string(data), "\n") {
		value, _, _ := strings.Cut(line, "#")
		value = strings.TrimSpace(value)
		if value != "" {
			entries = append(entries, value)
		}
	}
	if len(entries) == 0 || (slices.Contains(entries, "none") && (len(entries) != 1 || entries[0] != "none")) {
		return nil, errors.New("blocked-cidrs must list internal IPv4 networks or only the word none")
	}
	for _, value := range entries {
		if value == "none" {
			continue
		}
		p, err := parseNetwork(value, false)
		if err != nil {
			return nil, fmt.Errorf("blocked-cidrs: %w", err)
		}
		if !p.Addr().Is4() || p.Bits() == 0 {
			return nil, errors.New("blocked-cidrs must contain specific IPv4 networks")
		}
		prefixes = append(prefixes, p)
	}

	return prefixes, nil
}

func dockerPrefixes(prefixes []netip.Prefix, networks []network) ([]netip.Prefix, error) {
	for _, n := range networks {
		if n.Name == networkName {
			continue
		}
		for _, c := range n.IPAM.Config {
			if c.Subnet == "" {
				continue
			}
			p, err := parseNetwork(c.Subnet, true)
			if err != nil {
				return nil, fmt.Errorf("docker network %s: %w", n.Name, err)
			}
			if p.Addr().Is4() {
				prefixes = append(prefixes, p)
			}
		}
	}

	return prefixes, nil
}

func collapse(prefixes []netip.Prefix) []netip.Prefix {
	sort.Slice(prefixes, func(i, j int) bool {
		c := prefixes[i].Addr().Compare(prefixes[j].Addr())
		if c != 0 {
			return c < 0
		}
		return prefixes[i].Bits() < prefixes[j].Bits()
	})
	result := make([]netip.Prefix, 0, len(prefixes))
	for _, p := range prefixes {
		if len(result) > 0 && result[len(result)-1].Contains(p.Addr()) {
			continue
		}
		for len(result) > 0 && p.Bits() > 0 {
			prev := result[len(result)-1]
			if prev.Bits() != p.Bits() {
				break
			}
			parent := netip.PrefixFrom(p.Addr(), p.Bits()-1).Masked()
			if !parent.Contains(prev.Addr()) {
				break
			}
			result = result[:len(result)-1]
			p = parent
		}
		result = append(result, p)
	}
	return result
}

func rules(ctx context.Context, tool, name string) ([]string, error) {
	output, err := run(ctx, tool, "-w", "-S", name)
	if err != nil {
		return nil, err
	}
	var result []string
	for line := range strings.SplitSeq(output, "\n") {
		if strings.HasPrefix(line, "-A ") {
			result = append(result, line)
		}
	}
	return result, nil
}

func checkSysctls() error {

	for _, setting := range []string{"bridge-nf-call-iptables", "bridge-nf-call-ip6tables"} {
		data, err := os.ReadFile("/proc/sys/net/bridge/" + setting)
		if err != nil {
			return fmt.Errorf("read %s: %w", setting, err)
		}
		if strings.TrimSpace(string(data)) != "1" {
			return fmt.Errorf("%s must be enabled", setting)
		}
	}
	return nil
}

// Check verifies the current Docker bridge and firewall policy.
func Check(ctx context.Context) error {
	if err := checkSysctls(); err != nil {
		return err
	}
	networks, err := inspectNetworks(ctx)
	if err != nil {
		return err
	}
	if err := validateNetwork(ctx, networks); err != nil {
		return err
	}

	required := []struct{ tool, chain, first string }{
		{"iptables", "INPUT", "-A INPUT -i " + bridge + " -j DROP"},
		{"iptables", "FORWARD", "-A FORWARD -i " + bridge + " -j " + chain},
		{"ip6tables", "INPUT", "-A INPUT -i " + bridge + " -j DROP"},
		{"ip6tables", "FORWARD", "-A FORWARD -i " + bridge + " -j DROP"},
	}
	for _, r := range required {
		actual, err := rules(ctx, r.tool, r.chain)
		if err != nil {
			return err
		}
		if len(actual) == 0 || actual[0] != r.first {
			return fmt.Errorf("%s %s is missing its first bridge protection", r.tool, r.chain)
		}
	}

	actual, err := rules(ctx, "iptables", chain)
	if err != nil {
		return err
	}
	expected, err := expectedRules(ctx, networks)
	if err != nil {
		return err
	}
	if len(actual) != len(expected) {
		return errors.New("bridge forwarding rules do not match current Docker networks")
	}
	for i := range actual {
		if actual[i] != expected[i] {
			return errors.New("bridge forwarding rules do not match current Docker networks")
		}
	}
	return nil
}

// Setup provisions the dedicated Docker network and refreshes its firewall policy.
func Setup(ctx context.Context) error {
	// Keep the temporary drops on failure, including while checking the new policy.
	if err := applyBridgeGuards(ctx); err != nil {
		return err
	}
	networks, err := ensureBridge(ctx)
	if err != nil {
		return err
	}
	if err := ensureBridgeSysctls(ctx); err != nil {
		return err
	}
	if err := installForwardingPolicy(ctx, networks); err != nil {
		return err
	}
	if err := Check(ctx); err != nil {
		return err
	}
	return removeForwardRules(ctx, "DROP")
}

func applyBridgeGuards(ctx context.Context) error {
	for _, tool := range []string{"iptables", "ip6tables"} {
		for _, name := range []string{"INPUT", "FORWARD"} {
			if _, err := run(ctx, tool, "-w", "-I", name, "1", "-i", bridge, "-j", "DROP"); err != nil {
				return err
			}
		}
	}

	return nil
}

func ensureBridge(ctx context.Context) ([]network, error) {
	networks, err := inspectNetworks(ctx)
	if err != nil {
		return nil, err
	}

	found := false
	for _, n := range networks {
		if n.Name == networkName {
			found = true
		}
	}
	if !found {
		if _, err := run(ctx, "docker", "network", "create",
			"--driver", "bridge", "--subnet", subnet,
			"--opt", "com.docker.network.bridge.name="+bridge, networkName); err != nil {
			return nil, err
		}
	}

	networks, err = inspectNetworks(ctx)
	if err != nil {
		return nil, err
	}
	if err := validateNetwork(ctx, networks); err != nil {
		return nil, err
	}

	return networks, nil
}

func ensureBridgeSysctls(ctx context.Context) error {
	for _, setting := range []string{"bridge-nf-call-iptables", "bridge-nf-call-ip6tables"} {
		data, err := os.ReadFile("/proc/sys/net/bridge/" + setting)
		if err != nil {
			return fmt.Errorf("read %s: %w", setting, err)
		}
		if strings.TrimSpace(string(data)) != "1" {
			if _, err := run(ctx, "sysctl", "-w", "net.bridge."+setting+"=1"); err != nil {
				return err
			}
		}
	}

	return nil
}

func installForwardingPolicy(ctx context.Context, networks []network) error {
	output, err := run(ctx, "iptables", "-w", "-S")
	if err != nil {
		return err
	}
	action := "-N"
	if slices.Contains(strings.Fields(output), chain) {
		action = "-F"
	}
	if _, err := run(ctx, "iptables", "-w", action, chain); err != nil {
		return err
	}
	expected, err := expectedRules(ctx, networks)
	if err != nil {
		return err
	}
	for _, rule := range expected {
		if _, err := run(ctx, "iptables", append([]string{"-w"}, strings.Fields(rule)...)...); err != nil {
			return err
		}
	}

	for _, guard := range []struct{ tool, name string }{{"iptables", "INPUT"}, {"ip6tables", "INPUT"}, {"ip6tables", "FORWARD"}} {
		actual, err := rules(ctx, guard.tool, guard.name)
		if err != nil {
			return err
		}
		duplicate := "-A " + guard.name + " -i " + bridge + " -j DROP"
		for i := len(actual) - 1; i >= 1; i-- {
			if actual[i] == duplicate {
				if _, err := run(ctx, guard.tool, "-w", "-D", guard.name, strconv.Itoa(i+1)); err != nil {
					return err
				}
			}
		}
	}

	if err := removeForwardRules(ctx, chain); err != nil {
		return err
	}
	if _, err := run(ctx, "iptables", "-w", "-I", "FORWARD", "1", "-i", bridge, "-j", chain); err != nil {
		return err
	}
	return nil
}

func removeForwardRules(ctx context.Context, target string) error {
	for {
		_, err := run(ctx, "iptables", "-w", "-C", "FORWARD", "-i", bridge, "-j", target)
		if err != nil {
			var exit *exec.ExitError
			if errors.As(err, &exit) && exit.ExitCode() == 1 {
				return nil
			}
			return err
		}
		if _, err := run(ctx, "iptables", "-w", "-D", "FORWARD", "-i", bridge, "-j", target); err != nil {
			return err
		}
	}
}
