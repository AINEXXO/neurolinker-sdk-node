import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NeuroLinker } from "../../src/index.js";

const TOKEN = process.env.NEUROLINKER_API_KEY;

function uniqueName(prefix: string): string {
  return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

describe("e2e management — buckets CRUD", () => {
  it.skipIf(!TOKEN)("create / get / list / delete a bucket", async () => {
    const client = NeuroLinker.fromEnv();
    const name = uniqueName("sdk-e2e-bucket");
    let bucketUid: string | undefined;

    try {
      const created = await client.management.buckets.create({ name });
      bucketUid = (created as Record<string, unknown>).bucket_uid as string;
      expect(typeof bucketUid).toBe("string");
      expect(bucketUid.length).toBeGreaterThan(0);

      const got = await client.management.buckets.get(bucketUid);
      expect((got as any).bucket_uid).toBe(bucketUid);
      expect((got as any).name).toBe(name);

      const listed = await client.management.buckets.list();
      const buckets = (listed as any).buckets;
      expect(Array.isArray(buckets)).toBe(true);
      const found = (buckets as Array<Record<string, unknown>>).some(
        (b) => b && typeof b === "object" && b.bucket_uid === bucketUid,
      );
      expect(found).toBe(true);
    } finally {
      if (bucketUid) {
        await client.management.buckets.delete(bucketUid);
      }
    }
  });
});

describe("e2e management — secrets CRUD", () => {
  it.skipIf(!TOKEN)("create / list / update / delete a secret", async () => {
    const client = NeuroLinker.fromEnv();
    const name = uniqueName("sdk_e2e_secret");
    let secretId: string | undefined;

    try {
      const created = await client.management.secrets.create({
        name,
        value: "initial-value",
      });
      secretId =
        ((created as Record<string, unknown>).secret_id as string) ||
        ((created as Record<string, unknown>).id as string);
      expect(typeof secretId).toBe("string");
      expect(secretId.length).toBeGreaterThan(0);

      const listed = await client.management.secrets.list();
      expect(typeof listed).toBe("object");

      await client.management.secrets.update(secretId, { value: "rotated-value" });
    } finally {
      if (secretId) {
        await client.management.secrets.delete(secretId);
      }
    }
  });
});
