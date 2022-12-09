import { deferred } from "../../../deps.ts";
import { Crypto } from "../../crypto/crypto.ts";
import { AuthorKeypair, ShareKeypair } from "../../crypto/crypto-types.ts";
import { Peer } from "../../peer/peer.ts";
import { Replica } from "../../replica/replica.ts";
import { IServerExtension } from "../../server/extensions/extension.ts";
import { WebServerScenario } from "../scenarios/scenarios.ts";
import {
  makeOverlappingReplicaTuple,
  replicaAttachmentsAreSynced,
  replicaDocsAreSynced,
} from "../test-utils.ts";
import { assert } from "../asserts.ts";
import { sleep } from "../../util/misc.ts";

class ExtensionTest implements IServerExtension {
  private peer = deferred<Peer>();
  private replicas: Replica[];

  constructor(replicas: Replica[]) {
    this.replicas = replicas;
  }

  register(peer: Peer): Promise<void> {
    for (const replica of this.replicas) {
      peer.addReplica(replica);
    }

    this.peer.resolve(peer);

    return Promise.resolve();
  }

  handler(): Promise<Response | null> {
    return Promise.resolve(null);
  }

  async getPeer() {
    const peer = await this.peer;

    return peer;
  }
}

Deno.test("Server", async (test) => {
  const authorKeypair = await Crypto.generateAuthorKeypair(
    "test",
  ) as AuthorKeypair;

  // Create three shares
  const shareKeypairA = await Crypto.generateShareKeypair(
    "apples",
  ) as ShareKeypair;
  const shareKeypairB = await Crypto.generateShareKeypair(
    "bananas",
  ) as ShareKeypair;
  const shareKeypairC = await Crypto.generateShareKeypair(
    "coconuts",
  ) as ShareKeypair;

  const [replicaClientA, replicaServerA] = await makeOverlappingReplicaTuple(
    authorKeypair,
    shareKeypairA,
    50,
    2,
    100,
  );

  const [replicaClientB, replicaServerB] = await makeOverlappingReplicaTuple(
    authorKeypair,
    shareKeypairB,
    50,
    2,
    100,
  );

  const [replicaClientC, replicaServerC] = await makeOverlappingReplicaTuple(
    authorKeypair,
    shareKeypairC,
    50,
    2,
    100,
  );

  const peer = new Peer();

  peer.addReplica(replicaClientA);
  peer.addReplica(replicaClientB);
  peer.addReplica(replicaClientC);

  const testExtension = new ExtensionTest([
    replicaServerA,
    replicaServerB,
    replicaServerC,
  ]);

  const serverScenario = new WebServerScenario(8087);

  await serverScenario.start(testExtension);

  await test.step({
    name: "Syncs",
    fn: async () => {
      const syncer = peer.sync("http://localhost:8087");

      await syncer.isDone();

      assert(
        await replicaDocsAreSynced([replicaClientA, replicaServerA]),
        `+a docs are in sync`,
      );
      assert(
        await replicaDocsAreSynced([replicaClientB, replicaServerB]),
        `+b docs are in sync`,
      );
      assert(
        await replicaDocsAreSynced([replicaClientC, replicaServerC]),
        `+c docs are in sync`,
      );

      assert(
        await replicaAttachmentsAreSynced([replicaClientA, replicaServerA]),
        `+a attachments are in sync`,
      );

      assert(
        await replicaAttachmentsAreSynced([replicaClientB, replicaServerB]),
        `+b attachments are in sync`,
      );
      assert(
        await replicaAttachmentsAreSynced([replicaClientC, replicaServerC]),
        `+c attachments are in sync`,
      );
    },
    sanitizeOps: false,
    sanitizeResources: false,
  });

  await serverScenario.close();

  await replicaClientA.close(true);
  await replicaClientB.close(true);
  await replicaClientC.close(true);

  await replicaServerA.close(true);
  await replicaServerB.close(true);
  await replicaServerC.close(true);
});
