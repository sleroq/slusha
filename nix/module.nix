{ self }:
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.slusha;
in
{
  options.services.slusha = {
    enable = lib.mkEnableOption "Slusha Telegram bot";
    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
      description = "Slusha application package.";
    };
    environmentFile = lib.mkOption {
      type = lib.types.str;
      example = "/run/secrets/slusha.env";
      description = "Environment file containing BOT_TOKEN, OPENCODE_API_KEY, and DATABASE_URL.";
    };
  };

  config = lib.mkIf cfg.enable {
    users.groups.slusha = { };
    users.users.slusha = {
      isSystemUser = true;
      group = "slusha";
    };
    systemd.services.slusha = {
      description = "Slusha Telegram bot";
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" ];
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
