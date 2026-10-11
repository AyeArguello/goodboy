import { afterAll, describe, expect, it } from "vitest";
import { anonClient, createTestAdminClient, serviceClient } from "./helpers";

// These tests share a database with the real local gallery, so they only add
// rows with ids they can recognise and remove exactly those afterwards.
const MARK = "ffffffff-ffff-4fff-8fff-";
const created: string[] = [];

const testPath = (n: number) => `g/${MARK}${String(n).padStart(12, "0")}.webp`;

let counter = 0;
function row() {
  counter += 1;
  return {
    storage_path: testPath(counter),
    caption: `test ${counter}`,
    width: 800,
    height: 1000,
  };
}

async function insertTestRow() {
  const result = await serviceClient()
    .from("gallery_photos")
    .insert(row())
    .select("id, storage_path")
    .single();
  if (result.data) created.push(result.data.storage_path);
  return result;
}

async function photoCount() {
  const { count, error } = await serviceClient()
    .from("gallery_photos")
    .select("id", { count: "exact", head: true });
  expect(error).toBeNull();
  return count ?? 0;
}

async function fillTo(target: number) {
  let current = await photoCount();
  while (current < target) {
    const { error } = await insertTestRow();
    expect(error, JSON.stringify(error)).toBeNull();
    current += 1;
  }
}

afterAll(async () => {
  if (created.length > 0) {
    await serviceClient()
      .from("gallery_photos")
      .delete()
      .in("storage_path", created);
  }
});

describe("gallery_photos", () => {
  it("is readable by everyone but not writable by the public", async () => {
    const anon = anonClient();

    const read = await anon.from("gallery_photos").select("id").limit(1);
    expect(read.error).toBeNull();

    const write = await anon.from("gallery_photos").insert(row());
    expect(write.error).not.toBeNull();
    expect(write.error?.code).toBe("42501");
  });

  it("only lets an admin add or remove photos through the RPCs", async () => {
    const anon = anonClient();
    const add = await anon.rpc("admin_add_gallery_photo", {
      p_storage_path: testPath(900),
      p_caption: "x",
      p_width: 10,
      p_height: 10,
    });
    expect(add.error?.code).toBe("42501");

    const remove = await anon.rpc("admin_delete_gallery_photo", {
      p_id: "00000000-0000-4000-8000-000000000000",
    });
    expect(remove.error?.code).toBe("42501");
  });

  it("lets an admin add and remove a photo", async () => {
    await fillTo(Math.min(await photoCount(), 20));
    const admin = await createTestAdminClient();
    const path = testPath(901);

    const add = await admin.rpc("admin_add_gallery_photo", {
      p_storage_path: path,
      p_caption: "  Golden recién bañado  ",
      p_width: 640,
      p_height: 480,
    });
    expect(add.error, JSON.stringify(add.error)).toBeNull();
    created.push(path);

    const stored = await serviceClient()
      .from("gallery_photos")
      .select("id, caption, width, height")
      .eq("storage_path", path)
      .single();
    expect(stored.data).toMatchObject({
      caption: "Golden recién bañado",
      width: 640,
      height: 480,
    });

    const remove = await admin.rpc("admin_delete_gallery_photo", {
      p_id: stored.data!.id,
    });
    expect(remove.error, JSON.stringify(remove.error)).toBeNull();
    expect(remove.data).toBe(path);

    const again = await admin.rpc("admin_delete_gallery_photo", {
      p_id: stored.data!.id,
    });
    expect(again.error?.message).toContain("PHOTO_NOT_FOUND");
  });

  it("rejects paths that are not a random object name", async () => {
    const bad = await serviceClient()
      .from("gallery_photos")
      .insert({ ...row(), storage_path: "../../etc/passwd" });
    expect(bad.error).not.toBeNull();

    const noImage = await serviceClient()
      .from("gallery_photos")
      .insert({ ...row(), storage_path: `g/${MARK}000000000999.exe` });
    expect(noImage.error).not.toBeNull();
  });

  it("never holds more than 25 photos", async () => {
    await fillTo(25);
    expect(await photoCount()).toBe(25);

    const extra = await insertTestRow();
    expect(extra.error?.message).toContain("GALLERY_FULL");

    const admin = await createTestAdminClient();
    const viaRpc = await admin.rpc("admin_add_gallery_photo", {
      p_storage_path: testPath(902),
      p_caption: "de más",
      p_width: 10,
      p_height: 10,
    });
    expect(viaRpc.error?.message).toContain("GALLERY_FULL");
    expect(await photoCount()).toBe(25);
  });

  it("lets only one of two uploads that race for the last place in", async () => {
    // Free exactly one place: remove one of our own rows if we filled it.
    const mine = created.at(-1);
    if (mine) {
      await serviceClient()
        .from("gallery_photos")
        .delete()
        .eq("storage_path", mine);
      created.pop();
    }
    expect(await photoCount()).toBe(24);

    const results = await Promise.all([insertTestRow(), insertTestRow()]);
    const ok = results.filter((r) => !r.error).length;
    const full = results.filter((r) =>
      r.error?.message.includes("GALLERY_FULL"),
    ).length;

    expect(ok).toBe(1);
    expect(full).toBe(1);
    expect(await photoCount()).toBe(25);
  });
});
