import { checkShareIsValid } from "../core-validators/addresses.ts";
import { Crypto } from "../crypto/crypto.ts";
import { AuthorKeypair } from "../crypto/crypto-types.ts";
import { ShareAddress } from "./doc-types.ts";
import { isErr, ValidationError } from "./errors.ts";
import { Replica } from "../replica/replica.ts";
import { Peer } from "../peer/peer.ts";
import { ConfigEs5 } from "../formats/format_es5.ts";
import { parseInvitationURL } from "./invite.ts";

const EARTHSTAR_KEY = "earthstar";
const AUTHOR_KEY = "current_author";
const SHARES_KEY = "shares";
const SHARE_SECRETS_KEY = "share_secrets";
const SERVERS_KEY = "servers";

type SharedSettingsOpts = {
  /** A namespace to restrict these settings to. */
  namespace?: string;
  /** Whether to use session storage for these settings. */
  sessionOnly?: true;
};

/** Get and set values from a common pool of settings for Earthstar clients, such as an author, shares, share secrets, and servers.
 *
 * Uses the Storage API, so only clients on the same origin will share the same settings.
 */
export class SharedSettings {
  private namespace: string | undefined;
  private storage = localStorage;

  constructor(opts?: SharedSettingsOpts) {
    this.namespace = opts?.namespace;

    if (opts?.sessionOnly) {
      this.storage = sessionStorage;
    }

    // Deno and Node don't know about the storage event yet
    // So this is just for cross-browser tab changes.
    addEventListener("storage", (event) => {
      const changedKey = (event as any).key;

      switch (changedKey) {
        case makeStorageKey(AUTHOR_KEY, this.namespace): {
          this.fireAuthorEvent();
          break;
        }
        case makeStorageKey(SHARES_KEY, this.namespace): {
          this.fireSharesEvent();

          break;
        }
        case makeStorageKey(SHARE_SECRETS_KEY, this.namespace): {
          this.fireSecretsEvent();
          break;
        }
        case makeStorageKey(SERVERS_KEY, this.namespace): {
          this.fireServersEvent();

          break;
        }
      }
    });
  }

  // Author

  /** The currently persisted author keypair. */
  get author(): AuthorKeypair | null {
    const key = makeStorageKey(AUTHOR_KEY, this.namespace);

    const authorKeypair = getParsedValue(
      this.storage,
      key,
      isParsedAuthorKeypair,
    );

    return authorKeypair || null;
  }

  set author(keypair: AuthorKeypair | null) {
    const key = makeStorageKey(AUTHOR_KEY, this.namespace);

    this.storage.setItem(key, JSON.stringify(keypair));

    this.fireAuthorEvent();
  }

  // Shares

  /** An array of shares stored by these settings. */
  get shares(): ShareAddress[] {
    const key = makeStorageKey(SHARES_KEY, this.namespace);

    const shares = getParsedValue(this.storage, key, isParsedSharesArray);

    return shares || [];
  }

  /** Add a share to the settings.
   * @returns All stored shares after the addition, or a `ValidationError` if the address is invalid.
   */
  addShare(address: ShareAddress) {
    if (isErr(checkShareIsValid(address))) {
      return new ValidationError("Not a valid share");
    }

    const key = makeStorageKey(SHARES_KEY, this.namespace);
    const nextSharesSet = new Set([...this.shares, address]);
    const nextShares = Array.from(nextSharesSet);
    this.storage.setItem(key, JSON.stringify(nextShares));

    this.fireSharesEvent();

    return nextShares;
  }

  /** Removes a share from settings.
   * @returns All stored shares after the removal, or a `ValidationError` if the share is not yet known.
   */
  removeShare(addressToRemove: string) {
    const shares = this.shares;

    const indexOfShareToRemove = shares.findIndex((address) =>
      address === addressToRemove
    );

    if (indexOfShareToRemove === -1) {
      return new ValidationError("That share is not known yet");
    }

    shares.splice(indexOfShareToRemove, 1);
    const key = makeStorageKey(SHARES_KEY, this.namespace);

    this.storage.setItem(key, JSON.stringify(shares));

    this.fireSharesEvent();

    return shares;
  }

  // Share secrets

  /** A record of known shares and their corresponding secret, if known. */
  get shareSecrets() {
    const key = makeStorageKey(SHARE_SECRETS_KEY, this.namespace);

    const shares = getParsedValue(this.storage, key, isParsedSecretsDict);

    return shares || {};
  }

  /** Add a secret for a share already known to the settings.
   * @returns The next record of share secret pairs, or returns a `ValidationError` if the share is not known or if the secret is incorrect.
   */
  async addSecret(shareAddress: ShareAddress, secret: string) {
    const knownShare = this.shares.find((addr) => shareAddress === addr);

    if (!knownShare) {
      return new ValidationError("This share is not yet known.");
    }

    if (isErr(await Crypto.checkKeypairIsValid({ shareAddress, secret }))) {
      return new ValidationError("Not the right secret for this share.");
    }

    const key = makeStorageKey(SHARE_SECRETS_KEY, this.namespace);
    const nextSecrets = { ...this.shareSecrets, [shareAddress]: secret };

    this.storage.setItem(key, JSON.stringify(nextSecrets));
    this.fireSecretsEvent();
    return nextSecrets;
  }

  /** Remove a secret from settings.
   * @returns The next record of share secret pairs, or returns a `ValidationError` if the share is not known.
   */
  removeSecret(shareAddress: ShareAddress) {
    const secrets = this.shareSecrets;
    const currentSecret = secrets[shareAddress];

    if (!currentSecret) {
      return new ValidationError("Unknown share");
    }

    const key = makeStorageKey(SHARE_SECRETS_KEY, this.namespace);
    const nextSecrets = { ...secrets };
    delete nextSecrets[shareAddress];

    this.storage.setItem(key, JSON.stringify(nextSecrets));

    this.fireSecretsEvent();

    return nextSecrets;
  }

  // Servers

  /** An array of server URLs stored by these settings. */
  get servers(): string[] {
    const key = makeStorageKey(SERVERS_KEY, this.namespace);

    const servers = getParsedValue(this.storage, key, isParsedUrlArray);

    return servers || [];
  }

  /** Add a server URL to be stored by settings.
   * @returns The list of servers after the addition, or a `ValidationError` if the string is not a valid URL.
   */
  addServer(address: string): string[] | ValidationError {
    try {
      const url = new URL(address);

      const urlSet = new Set([...this.servers, url.toString()]);
      const nextServers = Array.from(urlSet);

      const key = makeStorageKey(SERVERS_KEY, this.namespace);
      this.storage.setItem(key, JSON.stringify(nextServers));

      this.fireServersEvent();

      return nextServers;
    } catch {
      return new ValidationError("Not a valid URL.");
    }
  }

  /** Remove a server URL from the settings' stored list of servers..
   * @returns The list of servers after the removal, or a `ValidationError` if the string is not yet known.
   */
  removeServer(addressToRemove: string) {
    try {
      const url = new URL(addressToRemove);

      const servers = this.servers;

      const indexOfShareToRemove = servers.findIndex((address) =>
        address === url.toString()
      );

      if (indexOfShareToRemove === -1) {
        return new ValidationError("That server is not known yet");
      }

      servers.splice(indexOfShareToRemove, 1);
      const key = makeStorageKey(SERVERS_KEY, this.namespace);

      this.storage.setItem(key, JSON.stringify(servers));

      this.fireServersEvent();
      return servers;
    } catch {
      return new ValidationError("Not a valid URL");
    }
  }

  /** Delete all stored settings. */
  clear() {
    const authorKey = makeStorageKey(AUTHOR_KEY, this.namespace);
    this.storage.setItem(authorKey, JSON.stringify(null));

    const sharesKey = makeStorageKey(SHARES_KEY, this.namespace);
    this.storage.setItem(sharesKey, JSON.stringify([]));

    const secretsKey = makeStorageKey(SHARE_SECRETS_KEY, this.namespace);
    this.storage.setItem(secretsKey, JSON.stringify({}));

    const serversKey = makeStorageKey(SERVERS_KEY, this.namespace);
    this.storage.setItem(serversKey, JSON.stringify([]));

    this.fireAuthorEvent();
    this.fireSharesEvent();
    this.fireSecretsEvent();
    this.fireServersEvent();
  }

  private authorChangedCbs = new Set<(keypair: AuthorKeypair | null) => void>();

  /** Fires the given callback when the stored author changes. */
  onAuthorChanged(cb: (keypair: AuthorKeypair | null) => void) {
    this.authorChangedCbs.add(cb);

    return () => {
      this.authorChangedCbs.delete(cb);
    };
  }

  private sharesChangedCbs = new Set<(shares: ShareAddress[]) => void>();

  /** Fires the given callback when the stored list of shares changes. */
  onSharesChanged(cb: (shares: ShareAddress[]) => void) {
    this.sharesChangedCbs.add(cb);

    return () => {
      this.sharesChangedCbs.delete(cb);
    };
  }

  private shareSecretsChangedCbs = new Set<
    (secrets: Record<ShareAddress, string>) => void
  >();

  /** Fires the given callback when the stored record of share secrets changes. */
  onShareSecretsChanged(cb: (secrets: Record<ShareAddress, string>) => void) {
    this.shareSecretsChangedCbs.add(cb);

    return () => {
      this.shareSecretsChangedCbs.delete(cb);
    };
  }

  private serversChangedCbs = new Set<(shares: string[]) => void>();

  /** Fires the given callback when the stored list of server URLs changes. */
  onServersChanged(cb: (shares: string[]) => void) {
    this.serversChangedCbs.add(cb);

    return () => {
      this.serversChangedCbs.delete(cb);
    };
  }

  /** Get a new `Peer` preconfigured with shares, secrets, and syncers derived from these settings.
   *
   * When settings are updated, the peer's replicas and syncers will be updated too.
   */
  getPeer(
    { sync, onCreateReplica }: {
      /** Whether to start syncing using the settings' servers. */
      sync: "once" | "continuous" | false;
      /** Used to create replicas when a new share is added to settings. */
      onCreateReplica: (addr: ShareAddress, secret?: string) => Replica;
    },
  ): {
    /** A preconfigured Peer. */
    peer: Peer;
    /** Stop changes to SharedSettings from propagating to the Peer. */
    unsubscribeFromSettings: () => void;
  } {
    const peer = new Peer();

    // Get all shares
    const shares = this.shares;

    // Add ones for those we do
    for (const share of shares) {
      const replica = onCreateReplica(share, this.shareSecrets[share]);
      peer.addReplica(replica);
    }

    // Listen for share events
    const unsubSharesChanged = this.onSharesChanged(async (newShares) => {
      const existingReplicas = peer.replicas();
      const existingShares = peer.shares();

      for (const replica of existingReplicas) {
        if (!newShares.includes(replica.share)) {
          peer.removeReplica(replica);

          await replica.close(false);
        }
      }

      for (const share of newShares) {
        if (!existingShares.includes(share)) {
          const replica = onCreateReplica(share, this.shareSecrets[share]);
          peer.addReplica(replica);
        }
      }
    });

    // Secrets

    // Listen for secret events
    const unsubSecretsChanged = this.onShareSecretsChanged(
      async (newSecrets) => {
        // We know that we can't add a secret without adding the share first.
        const existingShares = peer.shares();
        const nextShares = Object.keys(newSecrets);

        for (const share of existingShares) {
          // If the secret was removed, re-add the share's replica without the secret.
          if (!nextShares.includes(share)) {
            const existingReplica = peer.getReplica(share);

            if (existingReplica) {
              peer.removeReplica(existingReplica);
              existingReplica.close(false);
            }

            const replica = onCreateReplica(share);
            peer.addReplica(replica);
          }
        }

        for (const share of nextShares) {
          // If the secret was added, remove the old replica and add the new one with a secret

          // But only if the share doesn't have a secret yet.
          const existingReplica = peer.getReplica(share);
          if (
            existingReplica?.formatsConfig["es.5"] &&
            (existingReplica.formatsConfig["es.5"] as ConfigEs5)["shareSecret"]
          ) {
            continue;
          }

          await existingReplica?.close(false);
          peer.removeReplicaByShare(share);
          const replica = onCreateReplica(share, newSecrets[share]);
          peer.addReplica(replica);
        }
      },
    );

    // Servers

    // Add syncers for each server
    if (sync) {
      for (const server of this.servers) {
        peer.sync(server, sync === "continuous");
      }
    }

    // Listen for server events
    const unsubServersChanged = this.onServersChanged((newServers) => {
      if (sync) {
        // Remove syncers no longer in the new list
        const syncers = peer.getSyncers();

        for (const [_id, { description, syncer }] of syncers) {
          if (!newServers.includes(description)) {
            syncer.cancel();
          }
        }

        // Add syncers for servers not in the list yet.
        for (const newServer of newServers) {
          peer.sync(newServer, sync === "continuous");
        }
      }
    });

    const unsubscribeFromSettings = () => {
      // Unsub.
      unsubSharesChanged();
      unsubSecretsChanged();
      unsubServersChanged();
    };

    return { peer, unsubscribeFromSettings };
  }

  private fireAuthorEvent() {
    const author = this.author;

    for (const cb of this.authorChangedCbs) {
      cb(author);
    }
  }

  private fireSharesEvent() {
    const shares = this.shares;

    for (const cb of this.sharesChangedCbs) {
      cb(shares);
    }
  }

  private fireSecretsEvent() {
    const secrets = this.shareSecrets;

    for (const cb of this.shareSecretsChangedCbs) {
      cb(secrets);
    }
  }

  private fireServersEvent() {
    const servers = this.servers;

    for (const cb of this.serversChangedCbs) {
      cb(servers);
    }
  }

  /** Add a new share (and possibly secret) and servers using an Earthstar invitation URL. */
  async redeemInvitationURL(url: string): Promise<true | ValidationError> {
    const parsed = await parseInvitationURL(url);

    if (isErr(parsed)) {
      return parsed;
    }

    this.addShare(parsed.shareAddress);

    for (const server of parsed.servers) {
      this.addServer(server);
    }

    if (parsed.secret) {
      this.addSecret(parsed.shareAddress, parsed.secret);
    }

    return true;
  }
}

function makeStorageKey(key: string, namespace?: string) {
  return `${EARTHSTAR_KEY}:${namespace ? `${namespace}:` : ""}${key}`;
}

function getParsedValue<T>(
  storage: Storage,
  key: string,
  check: (parsed: unknown) => parsed is T,
): T | undefined {
  const value = storage.getItem(key);

  if (value === null) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);

    if (check(parsed)) {
      return parsed;
    } else {
      return undefined;
    }
  } catch {
    return undefined;
  }
}

function isObject(t: unknown): t is Record<string, unknown> {
  if (t === null || t === undefined) {
    return false;
  }

  if (typeof t !== "object") {
    return false;
  }

  return true;
}

function isParsedAuthorKeypair(t: unknown): t is AuthorKeypair {
  if (!isObject(t)) {
    return false;
  }

  if (Object.keys(t).length !== 2) {
    return false;
  }

  if ("address" in t === false) {
    return false;
  }

  if ("secret" in t === false) {
    return false;
  }

  return true;
}

function isParsedSharesArray(t: unknown): t is ShareAddress[] {
  if (!Array.isArray(t)) {
    return false;
  }

  if (t.some((val) => typeof val !== "string")) {
    return false;
  }

  if (t.some((val) => isErr(checkShareIsValid(val)))) {
    return false;
  }

  return true;
}

function isParsedSecretsDict(t: unknown): t is Record<ShareAddress, string> {
  if (!isObject(t)) {
    return false;
  }

  for (const key in t) {
    const secret = t[key];

    if (typeof secret !== "string") {
      return false;
    }

    if (
      isErr(Crypto.checkKeypairIsValid({
        shareAddress: key,
        secret: secret,
      }))
    ) {
      return false;
    }
  }

  return true;
}

function isParsedUrlArray(t: unknown): t is ShareAddress[] {
  if (!Array.isArray(t)) {
    return false;
  }

  if (t.some((val) => typeof val !== "string")) {
    return false;
  }

  for (const val of t) {
    try {
      new URL(val);
    } catch {
      return false;
    }
  }

  return true;
}
