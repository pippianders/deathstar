import { Crypto } from "../../crypto/crypto.ts";
import { setGlobalCryptoDriver } from "../../crypto/global-crypto-driver.ts";
import { Replica } from "../../replica/replica.ts";
import { randomId } from "../../util/misc.ts";
import { writeRandomDocs } from "../test-utils.ts";
import { cryptoScenarios, docDriverScenarios } from "../scenarios/scenarios.ts";
import { MultiplyScenarioOutput, ScenarioItem } from "../scenarios/types.ts";
import { multiplyScenarios } from "../scenarios/utils.ts";
import { AttachmentDriverMemory } from "../../replica/attachment_drivers/memory.ts";
import { AuthorKeypair } from "../../crypto/crypto-types.ts";
import { notErr } from "../../util/errors.ts";
import { assert } from "../asserts.ts";

const scenarios: MultiplyScenarioOutput<{
  "docDriver": ScenarioItem<typeof docDriverScenarios>;
  "crypto": ScenarioItem<typeof cryptoScenarios>;
}> = multiplyScenarios({
  description: "docDriver",
  scenarios: docDriverScenarios,
}, {
  description: "crypto",
  scenarios: cryptoScenarios,
});

for (const scenario of scenarios) {
  const replicaDriver = scenario.subscenarios.docDriver;
  const crypto = scenario.subscenarios.crypto;

  const shareKeypair = await Crypto.generateShareKeypair("test");

  assert(notErr(shareKeypair));

  const driverToClose = replicaDriver.makeDriver(
    shareKeypair.shareAddress,
    scenario.name,
  );

  const keypair = await Crypto.generateAuthorKeypair("test") as AuthorKeypair;
  const keypairB = await Crypto.generateAuthorKeypair("nest") as AuthorKeypair;

  const replicaToClose = new Replica({
    driver: {
      docDriver: driverToClose,
      attachmentDriver: new AttachmentDriverMemory(),
    },
  });

  await replicaToClose.close(true);
  const driver = replicaDriver.makeDriver(
    shareKeypair.shareAddress,
    scenario.name,
  );
  const replica = new Replica({
    driver: {
      docDriver: driver,
      attachmentDriver: new AttachmentDriverMemory(),
    },
  });

  await writeRandomDocs(keypair, replica, 100);

  await replica.set(keypair, {
    text: "hello",
    path: `/stable`,
  });

  await replica.set(keypairB, {
    text: "howdy",
    path: `/stable`,
  });

  Deno.bench(`Replica.set (${scenario.name})`, { group: "set" }, async () => {
    setGlobalCryptoDriver(crypto);
    await replica.set(keypair, {
      text: "hi",
      path: `/test/${randomId()}`,
    });
  });

  Deno.bench(
    `Replica.queryDocs (${scenario.name})`,
    { group: "queryDocs" },
    async () => {
      setGlobalCryptoDriver(crypto);
      await replica.queryDocs({});
    },
  );

  Deno.bench(
    `Replica.queryDocs (path ASC) (${scenario.name})`,
    { group: "queryDocs.pathAsc" },
    async () => {
      setGlobalCryptoDriver(crypto);
      await replica.queryDocs({
        orderBy: "path ASC",
      });
    },
  );

  Deno.bench(
    `Replica.queryDocs (localIndex ASC) (${scenario.name})`,
    { group: "queryDocs.localIndexAsc" },
    async () => {
      setGlobalCryptoDriver(crypto);
      await replica.queryDocs({
        orderBy: "localIndex ASC",
      });
    },
  );

  Deno.bench(
    `Replica.getLatestDocAtPath (${scenario.name})`,
    { group: "getLatestDocAtPath" },
    async () => {
      setGlobalCryptoDriver(crypto);
      await replica.getLatestDocAtPath("/stable.txt");
    },
  );

  Deno.bench(
    `Replica.getAllDocsAtPath (${scenario.name})`,
    { group: "getAllDocsAtPath" },
    async () => {
      setGlobalCryptoDriver(crypto);
      await replica.getAllDocsAtPath("/stable.txt");
    },
  );
}
