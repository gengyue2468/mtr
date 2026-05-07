import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

type BeszelData = {
  collectionId: string;
  collectionName: string;
  created: string;
  host: string;
  id: string;
  info: {
    t: number;
    u: number;
    cpu: number;
    mp: number;
    dp: number;
    v: string;
    bb: number;
    la: [number, number, number];
    ct: number;
  };
  name: string;
  port: string;
  status: string;
  updated: string;
  users: [string];
};

type MonitorData = {
  id: string;
  project_id: string;
  name: string;
  url: string;
  method: string;
  interval: number;
  timeout: number;
  expected_status: number;
  show_url: number;
  enabled: number;
  warn_ms: number;
  status: string;
  last_checked_at: number;
  created_at: number;
};

type CombinedData = {
  id: string;
  name: string;
  status: string;
  origin: "beszel" | "monitor";
};

const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authorization = c.req.header("Authorization");
  const bearerToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : undefined;
  if (bearerToken !== process.env.ACCESS_TOKEN) {
    return c.json({ error: "咦，你是谁啊？" }, 401);
  }
  await next();
};

function httpClient({
  url,
  method,
  token,
  data,
}: {
  url: string;
  method: "GET" | "POST";
  token?: string;
  data?: any;
}) {
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return axios({
    url,
    method,
    headers,
    data,
  });
}

async function getBeszelToken(): Promise<string> {
  try {
    const response = await httpClient({
      url: `${process.env.BESZEL_BASE_URL}/api/collections/users/auth-with-password`,
      method: "POST",
      data: {
        identity: process.env.BESZEL_EMAIL,
        password: process.env.BESZEL_PASSWORD,
      },
    });
    return response.data.token;
  } catch (error) {
    console.error("全坏了，没法拿到 Beszel Token!", error);
    throw new Error("全坏了，没法拿到 Beszel Token!");
  }
}

function getMonitorData(): Promise<MonitorData[]> {
  return httpClient({
    url: `${process.env.UPTIME_MONITOR_BASE_URL}/api/projects/default/monitors`,
    method: "GET",
  }).then((response) => response.data);
}

function getBeszelData(token: string): Promise<BeszelData[]> {
  return httpClient({
    url: `${process.env.BESZEL_BASE_URL}/api/collections/systems/records`,
    method: "GET",
    token,
  }).then((response) => response.data.items);
}

async function getCombinedData(): Promise<CombinedData[]> {
  return Promise.all([
    getMonitorData(),
    getBeszelData(await getBeszelToken()),
  ]).then(([monitorData, beszelData]) => {
    const combinedData: CombinedData[] = [
      ...monitorData.map((item) => ({
        id: item.id,
        name: item.name.toLowerCase(),
        status: item.status,
        origin: "monitor" as const,
      })),
      ...beszelData.map((item) => ({
        id: item.id,
        name: item.name.toLowerCase(),
        status: item.status,
        origin: "beszel" as const,
      })),
    ];
    return combinedData;
  });
}

const app = new Hono();

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.get("/monitor", authMiddleware, async (c) => {
  try {
    const monitorData = await getMonitorData();
    return c.json(monitorData);
  } catch (error) {
    console.error("全坏了，没法拿到 Monitor Data!", error);
    return c.json({ error: "全坏了，没法拿到 Monitor Data!" }, 500);
  }
});

app.get("/beszel", authMiddleware, async (c) => {
  try {
    const beszelData = await getBeszelData(await getBeszelToken());
    return c.json(beszelData);
  } catch (error) {
    console.error("全坏了，没法拿到 Beszel Data!", error);
    return c.json({ error: "全坏了，没法拿到 Beszel Data!" }, 500);
  }
});

app.get("/combined", authMiddleware, async (c) => {
  try {
    const combinedData = await getCombinedData();
    return c.json(combinedData);
  } catch (error) {
    console.error("全坏了，没法拿到 Combined Data!", error);
    return c.json({ error: "全坏了，没法拿到 Combined Data!" }, 500);
  }
});

export default {
  port: 6478,
  fetch: app.fetch,
};
