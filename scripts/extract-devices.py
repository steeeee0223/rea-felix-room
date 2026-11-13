"""Copy the device meshes and their glTF dependencies into two GLB files.

Usage: python3 scripts/extract-devices.py ROOM.glb GEAR_ALBEDO.jpg OUTPUT_DIR
"""

import copy
import json
from pathlib import Path
import re
import struct
import sys


def extract(source, data, albedo, select):
    output = {"asset": source["asset"], "scene": 0, "scenes": [{"nodes": []}]}
    if "extensionsUsed" in source:
        output["extensionsUsed"] = source["extensionsUsed"]
    indices = {}
    packed = bytearray()
    baked = {}
    albedo_index = None

    def pack(data):
        packed.extend(b"\0" * (-len(packed) % 4))
        offset = len(packed)
        packed.extend(data)
        return offset

    def bake_material(index):
        nonlocal albedo_index
        original = output["materials"][index]
        properties = original.get("pbrMetallicRoughness", {})
        if (original.get("alphaMode", "OPAQUE") != "OPAQUE"
                or original.get("extensions", {}).get("KHR_materials_transmission")
                or properties.get("metallicFactor", 1) > 0.5):
            return index
        if index in baked:
            return baked[index]
        if albedo_index is None:
            views = output.setdefault("bufferViews", [])
            images = output.setdefault("images", [])
            textures = output.setdefault("textures", [])
            images.append({"bufferView": len(views), "mimeType": "image/jpeg", "name": "Gear albedo"})
            views.append({"buffer": 0, "byteOffset": pack(albedo), "byteLength": len(albedo)})
            albedo_index = len(textures)
            textures.append({"source": len(images) - 1})
        material = copy.deepcopy(original)
        properties = material.setdefault("pbrMetallicRoughness", {})
        properties["baseColorTexture"] = {"index": albedo_index, "texCoord": 1}
        properties["baseColorFactor"] = [1, 1, 1, 1]
        baked[index] = len(output["materials"])
        output["materials"].append(material)
        return baked[index]

    def remap(key, index):
        lookup = (key, index)
        if lookup in indices:
            return indices[lookup]
        items = output.setdefault(key, [])
        indices[lookup] = len(items)
        item = copy.deepcopy(source[key][index])
        items.append(item)

        if key == "nodes":
            if "mesh" in item:
                item["mesh"] = remap("meshes", item["mesh"])
            if "children" in item:
                item["children"] = [remap("nodes", child) for child in item["children"]]
        elif key == "meshes":
            for primitive in item["primitives"]:
                for semantic, accessor in primitive["attributes"].items():
                    primitive["attributes"][semantic] = remap("accessors", accessor)
                if "indices" in primitive:
                    primitive["indices"] = remap("accessors", primitive["indices"])
                if "material" in primitive:
                    primitive["material"] = remap("materials", primitive["material"])
        elif key == "materials":
            def remap_textures(value):
                for field, child in value.items():
                    if field.endswith("Texture") and isinstance(child, dict) and "index" in child:
                        child["index"] = remap("textures", child["index"])
                    elif isinstance(child, dict):
                        remap_textures(child)
            remap_textures(item)
        elif key == "textures":
            item["source"] = remap("images", item["source"])
            if "sampler" in item:
                item["sampler"] = remap("samplers", item["sampler"])
        elif key in ("accessors", "images"):
            if "bufferView" in item:
                item["bufferView"] = remap("bufferViews", item["bufferView"])
        elif key == "bufferViews":
            assert item["buffer"] == 0
            offset = item.get("byteOffset", 0)
            item["byteOffset"] = pack(data[offset : offset + item["byteLength"]])
        return indices[lookup]

    roots = source["scenes"][source["scene"]]["nodes"]
    output["scenes"][0]["nodes"] = [
        remap("nodes", i) for i in roots if select(source["nodes"][i]["name"])
    ]
    assert output["scenes"][0]["nodes"], "No device meshes matched"
    # Use a separate material only on primitives with the recovered gear atlas UVs.
    baked_meshes = {}
    for node in output["nodes"]:
        if node.get("extras", {}).get("atlas") != "gear" or "mesh" not in node:
            continue
        mesh_index = node["mesh"]
        if mesh_index not in baked_meshes:
            mesh = copy.deepcopy(output["meshes"][mesh_index])
            for primitive in mesh["primitives"]:
                if "TEXCOORD_1" in primitive["attributes"] and "material" in primitive:
                    primitive["material"] = bake_material(primitive["material"])
            baked_meshes[mesh_index] = len(output["meshes"])
            output["meshes"].append(mesh)
        node["mesh"] = baked_meshes[mesh_index]
    used_meshes = sorted({node["mesh"] for node in output["nodes"] if "mesh" in node})
    mesh_indices = {index: i for i, index in enumerate(used_meshes)}
    output["meshes"] = [output["meshes"][index] for index in used_meshes]
    for node in output["nodes"]:
        if "mesh" in node:
            node["mesh"] = mesh_indices[node["mesh"]]
    packed.extend(b"\0" * (-len(packed) % 4))
    output["buffers"] = [{"byteLength": len(packed)}]
    header = json.dumps(output, separators=(",", ":")).encode()
    header += b" " * (-len(header) % 4)
    chunks = struct.pack("<I4s", len(header), b"JSON") + header
    chunks += struct.pack("<I4s", len(packed), b"BIN\0") + packed
    return struct.pack("<4sII", b"glTF", 2, 12 + len(chunks)) + chunks


room, atlas, destination = map(Path, sys.argv[1:])
raw = room.read_bytes()
assert raw[:8] == b"glTF\x02\0\0\0" and raw[16:20] == b"JSON"
end = 20 + struct.unpack_from("<I", raw, 12)[0]
assert raw[end + 4 : end + 8] == b"BIN\0"
source = json.loads(raw[20:end])
data = memoryview(raw)[end + 8 :]
albedo = atlas.read_bytes()
patterns = {
    "computer": r"^retro_",
    "tv": r"^(tv_|screen$|bnc_|power_inlet$|btn_|led_|t_(?:power|btn_|input|knob_|tapetron|model|pal)|rule_input$|knob_|wordmark$|vcr_|vfd|tape_(?:[a-z]+_)?0(?:\.|$))",
}
destination.mkdir(parents=True, exist_ok=True)
for name, pattern in patterns.items():
    (destination / f"{name}.glb").write_bytes(extract(source, data, albedo, re.compile(pattern).search))
