{ inputs, ... }:
{
  imports = [ inputs.slusha.nixosModules.default ];

  services.slusha = {
    enable = true;
    environmentFile = "/run/secrets/slusha.env";
  };
}
