{ self }:
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.slusha;
  blockedCidrsFile = pkgs.writeText "slusha-blocked-cidrs" (
    if cfg.blockedCidrs == [ ] then "none\n" else lib.concatLines cfg.blockedCidrs
  );
  sandboxImage = pkgs.dockerTools.buildLayeredImage {
    name = "slusha-sandbox";
    tag = "nix";
    contents = [
      pkgs.gnutar
      pkgs.curl
      pkgs.cacert
      pkgs.busybox
    ];
    extraCommands = ''
      mkdir -p workspace tmp
    '';
    config = {
      Labels."org.slusha.sandbox" = "1";
      User = "1000:1000";
      WorkingDir = "/workspace";
      Env = [
        "PATH=/bin"
        "SSL_CERT_FILE=/etc/ssl/certs/ca-bundle.crt"
      ];
      Cmd = [ "/bin/sh" ];
    };
  };
  networkTools = [
    pkgs.docker-client
    pkgs.iproute2
    pkgs.iptables
    pkgs.procps
  ];
in
{
  options.services.slusha = {
    enable = lib.mkEnableOption "Slusha Telegram bot";
    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
      description = "Slusha application package.";
    };
    sandboxPackage = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.sandboxd;
      description = "Privileged sandbox broker package.";
    };
    environmentFile = lib.mkOption {
      type = lib.types.str;
      example = "/run/secrets/slusha.env";
      description = "Environment file containing BOT_TOKEN, OPENCODE_API_KEY, and DATABASE_URL.";
    };
    blockedCidrs = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      description = "Internal IPv4 networks beyond those detected automatically; use an empty list if none.";
    };
  };

  config = lib.mkIf cfg.enable {
    virtualisation.docker.enable = lib.mkDefault true;
    virtualisation.docker.daemon.settings.runtimes.runsc.path = "${pkgs.gvisor}/bin/runsc";
    users.groups.slusha = { };
    users.users.slusha = {
      isSystemUser = true;
      group = "slusha";
    };
    environment.etc."slusha-gvisor/blocked-cidrs".source = blockedCidrsFile;
    systemd.tmpfiles.rules = [ "d /run/slusha-gvisor 0755 root root -" ];

    systemd.services.slusha-sandbox-image = {
      description = "Load Slusha sandbox image";
      after = [ "docker.service" ];
      requires = [ "docker.service" ];
      before = [ "slusha.service" ];
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
        ExecStart = "${pkgs.docker-client}/bin/docker load --input ${sandboxImage}";
      };
    };
    systemd.services.slusha-firewall = {
      description = "Provision Slusha sandbox firewall";
      after = [
        "docker.service"
        "firewall.service"
        "network-online.target"
      ];
      requires = [ "docker.service" ];
      wants = [ "network-online.target" ];
      restartTriggers = [ blockedCidrsFile ];
      before = [ "slusha-sandbox.service" ];
      path = networkTools;
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
        ExecStart = "${cfg.sandboxPackage}/bin/sandboxd setup";
      };
    };
    systemd.services.slusha-sandbox = {
      description = "Slusha sandbox broker";
      after = [
        "slusha-firewall.service"
        "slusha-sandbox-image.service"
      ];
      requires = [
        "slusha-firewall.service"
        "slusha-sandbox-image.service"
      ];
      path = networkTools ++ [ pkgs.coreutils ];
      environment = {
        SANDBOX_IMAGE = "slusha-sandbox:nix";
        SLUSHA_SANDBOX_GROUP = "slusha";
      };
      serviceConfig = {
        ExecStart = "${cfg.sandboxPackage}/bin/sandboxd serve";
        Restart = "on-failure";
        KillMode = "process";
        UMask = "0077";
      };
    };
    systemd.services.slusha = {
      description = "Slusha Telegram bot";
      wantedBy = [ "multi-user.target" ];
      after = [
        "network-online.target"
        "slusha-sandbox.service"
      ];
      requires = [ "slusha-sandbox.service" ];
      wants = [ "network-online.target" ];
      path = [
        pkgs.bash
        pkgs.coreutils
        pkgs.postgresql
        pkgs.util-linux
      ];
      environment = {
        DATA_DIR = "/var/lib/slusha";
        BACKUP_DIR = "/var/lib/slusha/backups";
        SANDBOX_LOCK_DIR = "/run/slusha-sandbox";
        NODE_ENV = "production";
      };
      serviceConfig = {
        User = "slusha";
        Group = "slusha";
        EnvironmentFile = cfg.environmentFile;
        ExecStart = "${cfg.package}/bin/slusha";
        Restart = "on-failure";
        RestartSec = 5;
        StateDirectory = "slusha";
        StateDirectoryMode = "0700";
        RuntimeDirectory = "slusha-sandbox";
        RuntimeDirectoryMode = "0700";
        UMask = "0077";
        NoNewPrivileges = true;
        CapabilityBoundingSet = "";
        ProtectSystem = "strict";
        ProtectHome = true;
        PrivateTmp = true;
      };
    };
  };
}
