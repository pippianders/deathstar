import { AuthorKeypair, ShareKeypair } from "../../crypto/crypto-types.ts";
import { Crypto } from "../../crypto/crypto.ts";
import { SharedSettings } from "../../util/shared_settings.ts";
import { isErr, notErr } from "../../util/errors.ts";
import { assert, assertEquals } from "../asserts.ts";
import { isNode } from "https://deno.land/x/which_runtime@0.2.0/mod.ts";
import { Replica } from "../../replica/replica.ts";
import { ReplicaDriverMemory } from "../../replica/driver_memory.ts";

Deno.test({
  name: "SharedSettings",
  // Don't run this on Node where it'll implode.
  ignore: isNode,
  fn: async (test) => {
    const settings = new SharedSettings();

    const shareAKeypair = await Crypto.generateShareKeypair(
      "apples",
    ) as ShareKeypair;
    const shareBKeypair = await Crypto.generateShareKeypair(
      "bananas",
    ) as ShareKeypair;
    const shareCKeypair = await Crypto.generateShareKeypair(
      "coconuts",
    ) as ShareKeypair;

    await test.step("Initial values", () => {
      assertEquals(settings.author, null);
      assertEquals(settings.shares, []);
      assertEquals(settings.shareSecrets, {});
      assertEquals(settings.servers, []);
    });

    await test.step("Author", async () => {
      const keypair = await Crypto.generateAuthorKeypair(
        "test",
      ) as AuthorKeypair;

      settings.author = keypair;
      assertEquals(settings.author, keypair);

      settings.author = null;
      assertEquals(settings.author, null);
    });

    await test.step("Shares", () => {
      // Don't add anything that isn't a share address
      const badRes = settings.addShare("bloop");
      assert(isErr(badRes));

      // Add valid share addresses
      const goodRes = settings.addShare(shareAKeypair.shareAddress);
      assert(notErr(goodRes));
      assert(settings.shares.length === 1);

      // Don't add the same address twice
      settings.addShare(shareAKeypair.shareAddress);
      assertEquals(settings.shares.length, 1);

      // Add another share address and remove it
      settings.addShare(shareBKeypair.shareAddress);
      assertEquals(settings.shares.length, 2);
      settings.removeShare(shareBKeypair.shareAddress);
      assertEquals(settings.shares.length, 1);

      assert(isErr(settings.removeShare(shareBKeypair.shareAddress)));
    });

    await test.step("Share secrets", async () => {
      // Don't add secrets for shares we don't know.
      const badRes = await settings.addSecret(
        shareBKeypair.shareAddress,
        shareBKeypair.secret,
      );
      assert(isErr(badRes));

      // Don't add invalid secrets
      const badRes2 = await settings.addSecret(
        shareAKeypair.shareAddress,
        "blooooop",
      );
      assert(isErr(badRes2));

      // Add valid secrets for shares we know
      const goodRes = await settings.addSecret(
        shareAKeypair.shareAddress,
        shareAKeypair.secret,
      );
      assert(notErr(goodRes));

      // Remove secrets for shares we know
      settings.addShare(shareBKeypair.shareAddress);
      await settings.addSecret(
        shareBKeypair.shareAddress,
        shareBKeypair.secret,
      );
      assertEquals(Object.keys(settings.shareSecrets).length, 2);
      const goodRes2 = settings.removeSecret(shareBKeypair.shareAddress);
      assert(notErr(goodRes2));

      // Don't remove secrets for shares we don't know
      const badRes3 = settings.removeSecret(shareBKeypair.shareAddress);
      assert(isErr(badRes3));
    });

    await test.step("Servers", () => {
      // Don't add anything that isn't a URL
      const badRes = settings.addServer("bloop");
      assert(isErr(badRes));

      // Add valid URLs
      const goodRes = settings.addServer("https://mypub.com");
      assert(notErr(goodRes));
      assert(settings.servers.length === 1);

      // Don't add the same address twice
      settings.addServer("https://mypub.com");
      assertEquals(settings.servers.length, 1);

      // Add another share address and remove it
      settings.addServer("https://otherpub.com");
      assertEquals(settings.servers.length, 2);
      settings.removeServer("https://otherpub.com");
      assertEquals(settings.servers.length, 1);

      // Can't remove a server twice
      assert(isErr(settings.removeServer("https://otherpub.com")));

      // Can't remove an invalid URL
      assert(isErr(settings.removeServer("blaaaaa")));
    });

    await test.step("Managed peer", async () => {
      const { peer, unsubscribeFromSettings } = settings.getPeer({
        sync: false,
        onCreateReplica: (addr, secret) =>
          new Replica({
            driver: new ReplicaDriverMemory(addr),
            shareSecret: secret,
          }),
      });

      assertEquals(peer.shares(), [
        shareAKeypair.shareAddress,
        shareBKeypair.shareAddress,
      ]);

      settings.addShare(shareCKeypair.shareAddress);

      assertEquals(peer.shares(), [
        shareAKeypair.shareAddress,
        shareBKeypair.shareAddress,
        shareCKeypair.shareAddress,
      ]);

      settings.addSecret(shareCKeypair.shareAddress, shareCKeypair.secret);

      const replicaC = peer.getReplica(shareCKeypair.shareAddress);

      assert(replicaC);

      const keypair = await Crypto.generateAuthorKeypair(
        "test",
      ) as AuthorKeypair;

      const res = await replicaC.set(keypair, { text: "test", path: "/test" });

      assert(notErr(res));

      for (const replica of peer.replicas()) {
        await replica.close(true);
      }

      unsubscribeFromSettings();
    });

    settings.clear();
  },
});
