package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"slusha/sandboxd/internal/firewall"
)

func main() {
	if err := runMain(); err != nil {
		log.Print(err)
		os.Exit(1)
	}
}

func runMain() error {
	if len(os.Args) < 2 {
		return errors.New("usage: sandboxd setup|serve")
	}
	switch os.Args[1] {
	case "setup":
		if len(os.Args) != 2 {
			return errors.New("unexpected arguments")
		}
		ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
		defer cancel()
		return firewall.Setup(ctx)
	case "serve":
		if len(os.Args) != 2 {
			return errors.New("unexpected arguments")
		}
		ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
		defer stop()
		return serve(ctx)
	case "watchdog":
		return watchdog(os.Args[2:])
	default:
		return fmt.Errorf("unknown subcommand")
	}
}
