package main

import "syscall"

func detachedProcess() *syscall.SysProcAttr { return &syscall.SysProcAttr{Setsid: true} }
