using UAssetAPI;
using UAssetAPI.UnrealTypes;
using UAssetAPI.Unversioned;
using Newtonsoft.Json;

if (args.Length < 1)
{
    Console.Error.WriteLine("Usage: UAssetCli tojson <source> <destination> <version> [mappings] | fromjson <source> <destination> [mappings]");
    return 2;
}

try
{
    switch (args[0].ToLowerInvariant())
    {
        case "tojson":
        {
            if (args.Length < 4) return 2;
            EngineVersion version = EngineVersion.UNKNOWN;
            if (int.TryParse(args[3], out int raw)) version = EngineVersion.VER_UE4_0 + raw;
            else if (args[3].Contains('.')) Enum.TryParse("VER_UE" + args[3].Replace('.', '_'), out version);
            else Enum.TryParse(args[3], out version);
            Usmap mappings = args.Length >= 5 ? new Usmap(args[4]) : null;
            var asset = new UAsset(args[1], version, mappings);
            File.WriteAllText(args[2], asset.SerializeJson(Formatting.Indented));
            return 0;
        }
        case "fromjson":
        {
            if (args.Length < 3) return 2;
            Usmap mappings = args.Length >= 4 ? new Usmap(args[3]) : null;
            UAsset asset;
            using (var input = File.OpenRead(args[1])) asset = UAsset.DeserializeJson(input);
            asset.Mappings = mappings;
            asset.FilePath = args[1];
            asset.Write(args[2]);
            return 0;
        }
        default:
            return 2;
    }
}
catch (Exception ex)
{
    Console.Error.WriteLine(ex);
    return 1;
}
