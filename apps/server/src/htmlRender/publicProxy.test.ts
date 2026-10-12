/** Verifies preview address filtering and SOCKS refusal/resource lifetime contracts. */
// @effect-diagnostics nodeBuiltinImport:off - raw sockets speak SOCKS5 to the proxy.
import { describe, expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";

import { publicAddresses, publicProxy } from "./publicProxy.ts";

// A public IPv4 address this machine holds, which no private range covers.
const OWN_PUBLIC_IPV4 = "198.51.100.7";
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof NodeOS>();
  return {
    ...actual,
    networkInterfaces: () => ({
      ...actual.networkInterfaces(),
      "t3-test": [
        {
          address: OWN_PUBLIC_IPV4,
          netmask: "255.255.255.0",
          family: "IPv4",
          mac: "00:00:00:00:00:00",
          internal: false,
          cidr: `${OWN_PUBLIC_IPV4}/24`,
        },
        {
          address: "198.18.0.1",
          netmask: "255.254.0.0",
          family: "IPv4",
          mac: "00:00:00:00:00:00",
          internal: false,
          cidr: "198.18.0.1/15",
        },
      ],
    }),
  };
});

/** Sends a SOCKS5 greeting and CONNECT, and resolves with the reply code. */
const connectThrough = (proxyPort: number, target: Buffer, version = 5) =>
  Effect.callback<{ readonly code: number; readonly socket: NodeNet.Socket }>((resume) => {
    const socket = NodeNet.connect(proxyPort, "127.0.0.1", () => {
      socket.write(Buffer.from([5, 1, 0]));
      socket.write(Buffer.concat([Buffer.from([version, 1, 0]), target]));
    });
    // The proxy may reset a refused connection.
    socket.on("error", () => {});
    let received = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      received = Buffer.concat([received, chunk]);
      // Method selection (2 bytes) then the 10-byte reply.
      if (received.length >= 12) resume(Effect.succeed({ code: received[3]!, socket }));
    });
    socket.on("close", () => resume(Effect.succeed({ code: received[3] ?? -1, socket })));
  });

/** Encodes a dotted IPv4 address and destination port as a SOCKS5 CONNECT target. */
const ipv4Target = (address: string, port: number) => {
  const target = Buffer.alloc(7);
  target[0] = 1;
  address.split(".").forEach((octet, index) => (target[1 + index] = Number(octet)));
  target.writeUInt16BE(port, 5);
  return target;
};

/** Encodes a hexadecimal IPv6 address (including compressed groups) and destination port. */
const ipv6Target = (address: string, port: number) => {
  const target = Buffer.alloc(19);
  target[0] = 4;
  const [head = "", tail = ""] = address.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  groups.forEach((group, index) => target.writeUInt16BE(Number.parseInt(group, 16), 1 + index * 2));
  target.writeUInt16BE(port, 17);
  return target;
};

/** `a.b.c.d` as the two hex groups of an IPv4-mapped IPv6 address. */
const toHexPair = (address: string) => {
  const [a = 0, b = 0, c = 0, d = 0] = address.split(".").map(Number);
  return `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
};

/** Encodes a hostname and destination port so the proxy, rather than the client, resolves it. */
const domainTarget = (host: string, port: number) => {
  const name = Buffer.from(host, "latin1");
  const target = Buffer.alloc(4 + name.length);
  target[0] = 3;
  target[1] = name.length;
  name.copy(target, 2);
  target.writeUInt16BE(port, 2 + name.length);
  return target;
};

describe("publicProxy", () => {
  it.each([
    "198.18.10.121.",
    "127.0.0.1.",
    "192.168.1.1.",
    "127.1",
    "2130706433",
    "0x7f000001",
    "0x7f.1",
    "::1.",
    "localhost",
    "localhost.",
    "foo.localhost",
    "FOO.LOCALHOST.",
    "LOCALHOST.",
    "cdn.123",
    "cdn.0X7F",
    "cdn.0x",
  ])("refuses ambiguous or loopback host %s before fake-IP lookup", async (host) => {
    expect(
      await publicAddresses(host, async () => [{ address: "198.18.10.157", family: 4 }]),
    ).toBeUndefined();
  });

  it("accepts a mixed-case domain with a trailing dot and IPv4 fake-IP", async () => {
    expect(
      await publicAddresses("CDN.Example.", async () => [{ address: "198.18.10.157", family: 4 }]),
    ).toEqual([{ address: "198.18.10.157", family: 4 }]);
  });

  it.effect.each(["127.0.0.1.", "127.1", "localhost."])(
    "refuses ambiguous SOCKS domain target %s",
    (host) =>
      Effect.gen(function* () {
        const port = yield* publicProxy;
        const { code, socket } = yield* connectThrough(port, domainTarget(host, 80));
        socket.destroy();
        expect(code).toBe(2);
      }),
  );

  it("accepts IPv4 fake-IP addresses resolved from a name", async () => {
    const addresses = [{ address: "198.18.10.121", family: 4 }];
    expect(await publicAddresses("cdn.example", async () => addresses)).toEqual(addresses);
  });

  it.each([
    {
      name: "a literal fake-IP address",
      host: "198.18.10.121",
      addresses: [{ address: "198.18.10.121", family: 4 }],
    },
    {
      name: "a name mixing fake-IP and private IPv4 addresses",
      host: "cdn.example",
      addresses: [
        { address: "198.18.10.121", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ],
    },
    {
      name: "a literal NAT64 address embedding fake-IP",
      host: "64:ff9b::c612:a79",
      addresses: [{ address: "64:ff9b::c612:a79", family: 6 }],
    },
    {
      name: "a literal IPv4-mapped address embedding fake-IP",
      host: "::ffff:c612:a79",
      addresses: [{ address: "::ffff:c612:a79", family: 6 }],
    },
    {
      name: "a name resolving to IPv4-mapped fake-IP",
      host: "cdn.example",
      addresses: [{ address: "::ffff:c612:a79", family: 6 }],
    },
    {
      name: "a name resolving to NAT64 fake-IP",
      host: "cdn.example",
      addresses: [{ address: "64:ff9b::c612:a79", family: 6 }],
    },
    {
      name: "a name resolving to this machine's fake-IP interface",
      host: "cdn.example",
      addresses: [{ address: "198.18.0.1", family: 4 }],
    },
  ])("refuses $name", async ({ host, addresses }) => {
    expect(await publicAddresses(host, async () => addresses)).toBeUndefined();
  });

  it.effect("refuses loopback and private targets, by address or by name", () =>
    Effect.gen(function* () {
      const port = yield* publicProxy;
      for (const target of [
        ipv4Target("127.0.0.1", 80),
        ipv4Target("10.1.2.3", 80),
        ipv4Target("169.254.169.254", 80),
        ipv4Target("198.18.0.1", 80),
        domainTarget("localhost", 80),
        // IPv6 forms that carry a local IPv4 address: NAT64, 6to4, Teredo,
        // and IPv4-compatible.
        ipv6Target("64:ff9b::7f00:1", 80),
        ipv6Target("64:ff9b::a00:1", 80),
        ipv6Target("2002:7f00:1::1", 80),
        ipv6Target("2001::1", 80),
        ipv6Target("::7f00:1", 80),
      ]) {
        const { code, socket } = yield* connectThrough(port, target);
        socket.destroy();
        expect(code).toBe(2);
      }
      // Port 0 is not a connection target.
      const { code, socket } = yield* connectThrough(port, ipv4Target("1.1.1.1", 0));
      socket.destroy();
      expect(code).toBe(7);
    }).pipe(Effect.scoped),
  );

  it.effect("refuses every address this machine holds, even a public one", () =>
    Effect.gen(function* () {
      const port = yield* publicProxy;
      const own = Object.values(NodeOS.networkInterfaces())
        .flatMap((entries) => entries ?? [])
        .filter((entry) => !entry.internal && !entry.address.startsWith("fe80"));
      // IPv4 also as IPv4-mapped IPv6, which names the same host.
      const targets = own.flatMap((entry) =>
        entry.family === "IPv6"
          ? [ipv6Target(entry.address, 80)]
          : [
              ipv4Target(entry.address, 80),
              ipv6Target(`::ffff:${toHexPair(entry.address)}`, 80),
              ipv6Target(`64:ff9b::${toHexPair(entry.address)}`, 80),
            ],
      );
      for (const target of targets) {
        const { code, socket } = yield* connectThrough(port, target);
        socket.destroy();
        expect(code).toBe(2);
      }
    }).pipe(Effect.scoped),
  );

  it.effect("refuses a request with a wrong version byte", () =>
    Effect.gen(function* () {
      const port = yield* publicProxy;
      const { code, socket } = yield* connectThrough(port, ipv4Target("1.1.1.1", 443), 4);
      socket.destroy();
      expect(code).toBe(7);
    }).pipe(Effect.scoped),
  );

  it.effect("fails instead of crashing when it cannot listen", () =>
    Effect.gen(function* () {
      const exhausted = Object.assign(new Error("too many open files"), { code: "EMFILE" });
      const listen = vi.spyOn(NodeNet.Server.prototype, "listen").mockImplementationOnce(function (
        this: NodeNet.Server,
      ) {
        process.nextTick(() => this.emit("error", exhausted));
        return this;
      });
      const error = yield* publicProxy.pipe(Effect.flip, Effect.scoped);
      listen.mockRestore();
      expect(error).toBe(exhausted);
    }),
  );

  it.effect("closes every connection when its scope closes", () =>
    Effect.gen(function* () {
      const socket = yield* Effect.scoped(
        Effect.gen(function* () {
          const port = yield* publicProxy;
          return yield* Effect.callback<NodeNet.Socket>((resume) => {
            // A client mid-handshake, which the proxy must not wait on; closing
            // resets it.
            const client = NodeNet.connect(port, "127.0.0.1", () => {
              client.write(Buffer.from([5, 1, 0]));
              resume(Effect.succeed(client));
            });
            client.on("error", () => {});
          });
        }),
      );
      yield* Effect.callback<void>((resume) => {
        if (socket.closed) return resume(Effect.void);
        socket.once("close", () => resume(Effect.void));
      });
      expect(socket.closed).toBe(true);
    }),
  );
});
