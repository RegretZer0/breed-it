const fs = require("fs");
const path = require("path");

const ph = require("philippine-location-json-for-geer");

/**
 * Try to locate the array of regions from the package export.
 * The package seems to export an object with:
 * - a big array (regions list)
 * - helper functions: getProvincesByRegion, getCityMunByProvince, getBarangayByMun, sort
 */
function getRegionsArray(pkg) {
  const candidates = ["regions", "data", "regionList", "region", "items", "list"];
  for (const key of candidates) {
    if (Array.isArray(pkg[key]) && pkg[key].length) return pkg[key];
  }

  // If not in known keys, try any array prop
  for (const [k, v] of Object.entries(pkg)) {
    if (Array.isArray(v) && v.length) return v;
  }

  return null;
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== "") return obj[k];
  }
  return "";
}

function uniqBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function safeName(s) {
  return (s || "").toString().trim().replace(/\s+/g, " ");
}

function main() {
  const regionsRaw = getRegionsArray(ph);
  if (!regionsRaw) {
    console.log("Package keys:", Object.keys(ph));
    throw new Error("Could not find regions array in package export.");
  }

  // Region list sometimes contains duplicates; normalize to unique by region_code or code/name.
  const regions = uniqBy(regionsRaw, (r) =>
    pick(r, ["region_code", "code", "reg_code", "id"]) || safeName(pick(r, ["region_name", "name"]))
  );

  if (
    typeof ph.getProvincesByRegion !== "function" ||
    typeof ph.getCityMunByProvince !== "function" ||
    typeof ph.getBarangayByMun !== "function"
  ) {
    console.log("Package keys:", Object.keys(ph));
    throw new Error("Missing helper functions in package export.");
  }

  const output = { regions: [] };

  for (const r of regions) {
    const regionCode =
      pick(r, ["region_code", "code", "reg_code", "id"]) ||
      safeName(pick(r, ["region_name", "name"]));

    const regionName = safeName(pick(r, ["region_name", "name"])) || String(regionCode);

    // Use helper: provinces by region
    const provincesRaw = ph.getProvincesByRegion(regionCode) || [];
    const provinces = uniqBy(provincesRaw, (p) =>
      pick(p, ["province_code", "code", "prov_code", "id"]) || safeName(pick(p, ["province_name", "name"]))
    );

    const regionObj = {
      code: String(regionCode),
      name: regionName,
      provinces: [],
    };

    for (const p of provinces) {
      const provinceCode =
        pick(p, ["province_code", "code", "prov_code", "id"]) ||
        safeName(pick(p, ["province_name", "name"]));

      const provinceName = safeName(pick(p, ["province_name", "name"])) || String(provinceCode);

      // Use helper: city/municipality by province
      const citiesRaw = ph.getCityMunByProvince(provinceCode) || [];
      const cities = uniqBy(citiesRaw, (c) =>
        pick(c, ["mun_code", "city_mun_code", "municipality_code", "code", "id"]) ||
        safeName(pick(c, ["mun_name", "city_mun_name", "municipality_name", "name"]))
      );

      const provinceObj = {
        code: String(provinceCode),
        name: provinceName,
        cities: [],
      };

      for (const c of cities) {
        const cityCode =
          pick(c, ["mun_code", "city_mun_code", "municipality_code", "code", "id"]) ||
          safeName(pick(c, ["mun_name", "city_mun_name", "municipality_name", "name"]));

        const cityName =
          safeName(pick(c, ["mun_name", "city_mun_name", "municipality_name", "name"])) ||
          String(cityCode);

        // Use helper: barangays by municipality/city code
        const brgysRaw = ph.getBarangayByMun(cityCode) || [];

        // brgy items could be strings OR objects; normalize to string list
        const barangays = uniqBy(
          brgysRaw.map((b) => (typeof b === "string" ? b : pick(b, ["barangay_name", "brgy_name", "name"]))),
          (x) => safeName(x)
        )
          .map((x) => safeName(x))
          .filter(Boolean);

        provinceObj.cities.push({
          code: String(cityCode),
          name: cityName,
          barangays,
        });
      }

      regionObj.provinces.push(provinceObj);
    }

    output.regions.push(regionObj);
  }

  // Output path
  const outputPath = path.join(__dirname, "public", "data", "ph-address.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // Write
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf8");

  console.log("✅ ph-address.json generated successfully!");
  console.log("📄 Saved to:", outputPath);
  console.log("ℹ️ Regions:", output.regions.length);
}

main();