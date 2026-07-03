const ETH_MAINNET_CHAIN_ID = "0x1";
const WALLET_STORAGE_KEY = "humanoid_wallet_address";

const landing = document.getElementById("landing");
const navTabs = document.querySelectorAll(".nav-tab");
const views = {
  home: document.getElementById("homeView"),
  agents: document.getElementById("agentsView"),
};

function showView(name) {
  if (!views[name]) {
    return;
  }

  Object.entries(views).forEach(([key, view]) => {
    view.hidden = key !== name;
  });

  navTabs.forEach((tab) => {
    const isActive = tab.dataset.view === name;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

navTabs.forEach((tab) => {
  tab.addEventListener("click", () => showView(tab.dataset.view));
});

const openWhitelist = document.getElementById("openWhitelist");
const whitelistModal = document.getElementById("whitelistModal");
const closeWhitelist = document.getElementById("closeWhitelist");
const walletButtons = [
  document.getElementById("headerWallet"),
  document.getElementById("formWallet"),
];
const walletState = document.getElementById("walletState");
const walletAddress = document.getElementById("walletAddress");
const whitelistFields = document.getElementById("whitelistFields");
const whitelistForm = document.getElementById("whitelistForm");
const formMessage = document.getElementById("formMessage");
const submitRequest = document.getElementById("submitRequest");

let connectedWallet = "";

function getEthereumProvider() {
  if (!window.ethereum) {
    return null;
  }

  if (Array.isArray(window.ethereum.providers)) {
    return window.ethereum.providers.find((provider) => provider.isMetaMask) || window.ethereum.providers[0];
  }

  return window.ethereum;
}

function isMobile() {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
}

function persistWallet(address) {
  try {
    if (address) {
      localStorage.setItem(WALLET_STORAGE_KEY, address);
    } else {
      localStorage.removeItem(WALLET_STORAGE_KEY);
    }
  } catch {
    // Storage can be unavailable in private browser contexts.
  }
}

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function setMessage(message) {
  formMessage.textContent = message;
}

function openWhitelistModal() {
  if (!whitelistModal.open) {
    whitelistModal.showModal();
  }
}

function setWalletButtons(text, connected = false) {
  walletButtons.forEach((button) => {
    button.classList.toggle("connected", connected);
    button.querySelector("span:last-child").textContent = text;
    if (connected) {
      button.setAttribute("aria-label", `Connected wallet ${text} on Ethereum mainnet`);
    } else {
      button.removeAttribute("aria-label");
    }
  });
}

function setConnected(address) {
  connectedWallet = address;
  persistWallet(address);
  walletAddress.value = address;
  whitelistFields.disabled = false;
  submitRequest.disabled = false;
  walletState.textContent = `Connected ${shortAddress(address)} on Ethereum`;
  setMessage("ETH wallet connected. Form unlocked.");
  setWalletButtons(shortAddress(address), true);
}

function setDisconnected(message = "") {
  connectedWallet = "";
  persistWallet(null);
  walletAddress.value = "";
  whitelistFields.disabled = true;
  submitRequest.disabled = true;
  walletState.textContent = "Wallet disconnected";
  setMessage(message);
  setWalletButtons("Connect", false);
}

function setWrongChain(address) {
  connectedWallet = "";
  walletAddress.value = address || "";
  whitelistFields.disabled = true;
  submitRequest.disabled = true;
  walletState.textContent = "Switch to Ethereum mainnet";
  setMessage("Please switch MetaMask to Ethereum mainnet to unlock the form.");
  setWalletButtons("Switch ETH", false);
}

async function ensureEthereumMainnet(provider) {
  const currentChainId = await provider.request({ method: "eth_chainId" });
  if (currentChainId === ETH_MAINNET_CHAIN_ID) {
    return;
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ETH_MAINNET_CHAIN_ID }],
    });
  } catch (error) {
    if (error?.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: ETH_MAINNET_CHAIN_ID,
            chainName: "Ethereum Mainnet",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://eth.llamarpc.com"],
            blockExplorerUrls: ["https://etherscan.io"],
          },
        ],
      });
      return;
    }

    throw new Error("Please switch to Ethereum mainnet to continue.");
  }
}

async function requestAccountsWithTimeout(provider) {
  return Promise.race([
    provider.request({ method: "eth_requestAccounts" }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), 60000);
    }),
  ]);
}

async function connectWallet() {
  setMessage("");
  const provider = getEthereumProvider();

  if (!provider && isMobile()) {
    const dappUrl = window.location.href.replace(/^https?:\/\//, "");
    window.location.href = `https://metamask.app.link/dapp/${dappUrl}`;
    return;
  }

  if (!provider) {
    walletState.textContent = "MetaMask unavailable";
    setMessage("Install MetaMask or open this page in a Web3-enabled browser.");
    openWhitelistModal();
    return;
  }

  try {
    walletState.textContent = "Connecting MetaMask...";
    setWalletButtons("Connecting", false);
    const accounts = await requestAccountsWithTimeout(provider);
    const address = accounts?.[0];
    if (!address) {
      setDisconnected("No wallet account returned.");
      return;
    }

    walletState.textContent = "Switching to Ethereum...";
    setWalletButtons("ETH chain", false);
    await ensureEthereumMainnet(provider);
    setConnected(address);
    openWhitelistModal();
  } catch (error) {
    if (error?.code === 4001) {
      walletState.textContent = "Connection rejected";
      setMessage("Approve the MetaMask request to connect your ETH wallet.");
    } else if (error?.message === "timeout") {
      walletState.textContent = "Connection timed out";
      setMessage("MetaMask did not respond. Check the extension and try again.");
    } else {
      walletState.textContent = "Connection incomplete";
      setMessage(error?.message || "Failed to connect wallet. Please try again.");
    }
    setWalletButtons("Connect", false);
  }
}

async function restoreWallet() {
  const provider = getEthereumProvider();
  if (!provider) {
    return;
  }

  try {
    const accounts = await provider.request({ method: "eth_accounts" });
    const address = accounts?.[0];
    if (!address) {
      setDisconnected("");
      return;
    }

    const chainId = await provider.request({ method: "eth_chainId" });
    if (chainId === ETH_MAINNET_CHAIN_ID) {
      setConnected(address);
      setMessage("");
    } else {
      persistWallet(address);
      setWrongChain(address);
    }
  } catch {
    setMessage("");
  }
}

openWhitelist.addEventListener("click", () => {
  openWhitelistModal();
});

closeWhitelist.addEventListener("click", () => {
  whitelistModal.close();
});

whitelistModal.addEventListener("click", (event) => {
  if (event.target === whitelistModal) {
    whitelistModal.close();
  }
});

walletButtons.forEach((button) => {
  button.addEventListener("click", connectWallet);
});

whitelistForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!connectedWallet) {
    setMessage("Connect a MetaMask wallet on Ethereum mainnet before submitting.");
    return;
  }

  const formData = new FormData(whitelistForm);
  const entry = Object.fromEntries(formData.entries());
  entry.chainId = ETH_MAINNET_CHAIN_ID;
  submitRequest.disabled = true;
  setMessage("Submitting to whitelist...");

  fetch("/api/whitelist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Whitelist submission failed.");
      }
      return payload;
    })
    .then(() => {
      whitelistForm.reset();
      walletAddress.value = connectedWallet;
      setMessage("Request received. Your ETH wallet is queued.");
    })
    .catch((error) => {
      setMessage(error.message || "Whitelist submission failed. Please try again.");
    })
    .finally(() => {
      submitRequest.disabled = !connectedWallet;
    });
});

const provider = getEthereumProvider();
if (provider) {
  provider.on?.("accountsChanged", async (accounts) => {
    if (!accounts?.[0]) {
      setDisconnected("Wallet disconnected.");
      return;
    }

    try {
      const chainId = await provider.request({ method: "eth_chainId" });
      if (chainId === ETH_MAINNET_CHAIN_ID) {
        setConnected(accounts[0]);
      } else {
        persistWallet(accounts[0]);
        setWrongChain(accounts[0]);
      }
    } catch {
      setWrongChain(accounts[0]);
    }
  });

  provider.on?.("chainChanged", async (chainId) => {
    try {
      const accounts = await provider.request({ method: "eth_accounts" });
      const address = accounts?.[0];
      if (!address) {
        setDisconnected("");
      } else if (chainId === ETH_MAINNET_CHAIN_ID) {
        setConnected(address);
      } else {
        setWrongChain(address);
      }
    } catch {
      setWrongChain(connectedWallet);
    }
  });
}

if (window.matchMedia("(pointer: fine)").matches) {
  window.addEventListener("pointermove", (event) => {
    const x = (event.clientX / window.innerWidth - 0.5) * 18;
    const y = (event.clientY / window.innerHeight - 0.5) * 14;
    landing.style.setProperty("--mx", `${x}px`);
    landing.style.setProperty("--my", `${y}px`);
  });
}

// ---- Agents arena (interactive demo) ----
const AGENTS = {
  scout: {
    id: "money-scout",
    name: "Money Scout",
    skill: "MARKET_RECON",
    task: "Scout the internet for a profitable ecommerce product I can launch this quarter.",
    steps: [
      { t: "sys", text: "Boot Money Scout · loading skill MARKET_RECON" },
      { t: "tool", chip: "SEARCH", text: "trending ecommerce niches · Q3 2026", dur: 1200, done: "1,284 sources" },
      { t: "tool", chip: "SCRAPE", text: "TikTok Shop · Amazon Movers · Etsy trending", dur: 1400, done: "312 products" },
      { t: "think", text: "Filtering for gross margin > 60% and shippable under 500g…" },
      { t: "tool", chip: "ANALYZE", text: "demand curve · seasonality · ad saturation", dur: 1500, done: "38 candidates" },
      { t: "think", text: "Cross-checking supplier pricing on Alibaba & CJ Dropshipping…" },
      { t: "tool", chip: "VERIFY", text: "supplier MOQ · lead time · review velocity", dur: 1300, done: "7 verified" },
      { t: "tool", chip: "RANK", text: "profit × confidence × speed-to-launch", dur: 900, done: "top pick locked" },
      { t: "sys", text: "Opportunity found." },
    ],
    result: {
      badge: "ECOMMERCE OPPORTUNITY",
      confidence: 82,
      title: "Collapsible Travel Bottle Kit (TSA-ready)",
      metrics: [
        { k: "Demand", v: "+62% YoY", up: true },
        { k: "Avg. sell price", v: "$24.90" },
        { k: "Landed COGS", v: "$6.10" },
        { k: "Gross margin", v: "75%", up: true },
        { k: "Competition", v: "Moderate" },
        { k: "Est. profit / mo", v: "$6,300", accent: true },
      ],
      note: "Low branded competition, high repeat-purchase potential. Best channels: TikTok Shop, Amazon FBA, Shopify.",
      skill: { name: "AUTO_SOURCE", label: "find & vet 5 suppliers" },
    },
  },
  signal: {
    id: "signal",
    name: "Signal",
    skill: "SIGNAL_FILTER",
    task: "Filter the noise and surface one high-conviction market signal.",
    steps: [
      { t: "sys", text: "Boot Signal · loading skill SIGNAL_FILTER" },
      { t: "tool", chip: "SEARCH", text: "X · Farcaster · news feeds · last 24h", dur: 1200, done: "18,400 posts" },
      { t: "tool", chip: "SCRAPE", text: "de-dupe · bot-filter · source weighting", dur: 1200, done: "signal/noise 6%" },
      { t: "think", text: "Clustering narratives by momentum and source credibility…" },
      { t: "tool", chip: "ANALYZE", text: "sentiment · velocity · on-chain confirm", dur: 1400, done: "3 clusters" },
      { t: "tool", chip: "VERIFY", text: "cross-check whale flow & liquidity", dur: 1200, done: "1 confirmed" },
      { t: "sys", text: "Signal locked." },
    ],
    result: {
      badge: "MARKET SIGNAL",
      confidence: 76,
      title: "Rotation into RWA infrastructure",
      metrics: [
        { k: "Sentiment", v: "+41% (24h)", up: true },
        { k: "Mentions", v: "3.2× baseline", up: true },
        { k: "Whale flow", v: "Net inflow", up: true },
        { k: "Liquidity", v: "Deepening" },
        { k: "Window", v: "12–36h", accent: true },
        { k: "Risk", v: "Elevated" },
      ],
      note: "Momentum is front-running catalysts — size the entry accordingly.",
      skill: { name: "ALERT_WATCH", label: "ping me on confirmation" },
    },
  },
  medic: {
    id: "medic",
    name: "Medic",
    skill: "RISK_GUARD",
    task: "Audit my wallet and flag anything risky before I sign.",
    steps: [
      { t: "sys", text: "Boot Medic · loading skill RISK_GUARD" },
      { t: "tool", chip: "SCAN", text: "token approvals across 142 contracts", dur: 1200, done: "142 checked" },
      { t: "tool", chip: "SIMULATE", text: "pending transaction in sandbox", dur: 1300, done: "no drain" },
      { t: "think", text: "Comparing approvals against known-malicious registry…" },
      { t: "tool", chip: "VERIFY", text: "contract source · owner privileges", dur: 1200, done: "2 flagged" },
      { t: "sys", text: "Audit complete." },
    ],
    result: {
      badge: "RISK REPORT",
      confidence: 91,
      title: "2 risky approvals found",
      metrics: [
        { k: "Unlimited approvals", v: "2", accent: true },
        { k: "Exposure", v: "$4,120", accent: true },
        { k: "Malicious sigs", v: "0", up: true },
        { k: "Wallet health", v: "B+" },
        { k: "Simulation", v: "Safe", up: true },
        { k: "Action", v: "Revoke 2" },
      ],
      note: "Revoke stale unlimited approvals to cut standing exposure to $0.",
      skill: { name: "AUTO_REVOKE", label: "revoke the 2 approvals" },
    },
  },
  cartographer: {
    id: "cartographer",
    name: "Cartographer",
    skill: "ROUTE_MAP",
    task: "Map the cheapest route to bridge and farm this position.",
    steps: [
      { t: "sys", text: "Boot Cartographer · loading skill ROUTE_MAP" },
      { t: "tool", chip: "SEARCH", text: "bridges · DEX routes · yield venues", dur: 1200, done: "26 routes" },
      { t: "tool", chip: "ANALYZE", text: "gas · slippage · bridge risk", dur: 1300, done: "priced" },
      { t: "think", text: "Optimizing for net APY after all-in cost…" },
      { t: "tool", chip: "RANK", text: "cost × safety × net APY", dur: 1000, done: "route locked" },
      { t: "sys", text: "Route mapped." },
    ],
    result: {
      badge: "OPTIMAL ROUTE",
      confidence: 84,
      title: "Base → Arbitrum · GMX LP",
      metrics: [
        { k: "Net APY", v: "19.4%", up: true },
        { k: "All-in cost", v: "$3.80" },
        { k: "Bridge time", v: "~4 min" },
        { k: "Slippage", v: "0.06%", up: true },
        { k: "Bridge risk", v: "Low" },
        { k: "Steps", v: "3", accent: true },
      ],
      note: "Best net APY after gas, slippage, and bridge fees across 26 routes.",
      skill: { name: "AUTO_EXECUTE", label: "run the 3-step route" },
    },
  },
};

const arenaLog = document.getElementById("arenaLog");
const runButton = document.getElementById("runAgent");
const consoleStatus = document.getElementById("consoleStatus");
const consoleTask = document.getElementById("consoleTask");
const consoleTitle = document.getElementById("consoleTitle");
const consoleSkill = document.getElementById("consoleSkill");
const consoleBar = document.getElementById("consoleBar");
const rosterItems = document.querySelectorAll(".roster-item");

if (arenaLog && runButton) {
  let currentAgent = "scout";
  let runToken = 0;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const randomSession = () => `#${4000 + Math.floor(Math.random() * 900)}`;

  function clock(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const tenths = Math.floor((ms % 1000) / 100);
    const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const ss = String(totalSeconds % 60).padStart(2, "0");
    return `${mm}:${ss}.${tenths}`;
  }

  function setStatus(state, text) {
    consoleStatus.dataset.state = state;
    consoleStatus.textContent = text;
  }

  function scrollLog() {
    arenaLog.scrollTop = arenaLog.scrollHeight;
  }

  function addLine(ms, step) {
    const line = document.createElement("div");
    line.className = `log-line is-${step.t}`;
    const time = document.createElement("span");
    time.className = "log-time";
    time.textContent = clock(ms);
    const text = document.createElement("span");
    text.className = "log-text";
    text.textContent = step.t === "think" ? `↳ ${step.text}` : step.text;
    line.append(time, text);
    arenaLog.appendChild(line);
    scrollLog();
  }

  function addToolLine(ms, step) {
    const line = document.createElement("div");
    line.className = "log-line is-tool";
    const time = document.createElement("span");
    time.className = "log-time";
    time.textContent = clock(ms);
    const chip = document.createElement("span");
    chip.className = "tool-chip";
    chip.textContent = step.chip;
    const text = document.createElement("span");
    text.className = "log-text";
    text.textContent = step.text;
    const state = document.createElement("span");
    state.className = "tool-state pending";
    state.innerHTML = 'running<span class="ell">…</span>';
    line.append(time, chip, text, state);
    arenaLog.appendChild(line);
    scrollLog();
    return state;
  }

  function resolveToolLine(state, step) {
    state.className = "tool-state done";
    state.textContent = `✓ ${step.done}`;
  }

  function renderResult(result) {
    const card = document.createElement("div");
    card.className = "op-card";

    const metrics = result.metrics
      .map(
        (m) =>
          `<div class="op-metric ${m.accent ? "is-accent" : ""}"><span class="op-k">${m.k}</span><span class="op-v ${m.up ? "is-up" : ""}">${m.v}</span></div>`,
      )
      .join("");

    card.innerHTML =
      `<div class="op-top"><span class="op-badge">${result.badge}</span><span class="op-conf">${result.confidence}% confidence</span></div>` +
      `<h4 class="op-title">${result.title}</h4>` +
      `<div class="op-metrics">${metrics}</div>` +
      (result.note ? `<p class="op-note">${result.note}</p>` : "") +
      `<div class="op-next">` +
      `<div class="op-next-copy"><span class="op-next-label">Next skill</span><strong>${result.skill.name}</strong> — ${result.skill.label}</div>` +
      `<button class="op-deploy" type="button">Deploy skill</button>` +
      `</div>`;

    arenaLog.appendChild(card);

    const deploy = card.querySelector(".op-deploy");
    deploy.addEventListener("click", () => {
      deploy.disabled = true;
      deploy.textContent = "Skill queued ✓";
    });

    scrollLog();
  }

  function selectAgent(key) {
    const agent = AGENTS[key];
    if (!agent) {
      return;
    }

    runToken += 1; // cancels any in-flight run
    currentAgent = key;

    rosterItems.forEach((item) => {
      const isActive = item.dataset.agent === key;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    consoleTitle.textContent = `${agent.id} · session ${randomSession()}`;
    consoleTask.textContent = agent.task;
    consoleSkill.textContent = `SKILL · ${agent.skill}`;
    consoleBar.style.width = "0%";
    setStatus("idle", "IDLE");
    runButton.disabled = false;
    runButton.textContent = "Run agent";

    arenaLog.innerHTML = "";
    const hint = document.createElement("div");
    hint.className = "log-hint";
    hint.textContent = `▸ Press Run agent to start ${agent.name} with skill ${agent.skill}.`;
    arenaLog.appendChild(hint);
  }

  async function runAgent() {
    const token = (runToken += 1);
    const agent = AGENTS[currentAgent];

    arenaLog.innerHTML = "";
    runButton.disabled = true;
    setStatus("run", "RUNNING");
    consoleBar.style.width = "0%";

    let elapsed = 0;
    const total = agent.steps.length;

    for (let i = 0; i < agent.steps.length; i += 1) {
      if (token !== runToken) {
        return;
      }

      const step = agent.steps[i];
      elapsed += 300 + Math.floor(Math.random() * 300);

      if (step.t === "tool") {
        const state = addToolLine(elapsed, step);
        await sleep(step.dur || 1000);
        if (token !== runToken) {
          return;
        }
        elapsed += step.dur || 1000;
        resolveToolLine(state, step);
      } else {
        addLine(elapsed, step);
        await sleep(step.t === "think" ? 900 : 600);
        if (token !== runToken) {
          return;
        }
      }

      consoleBar.style.width = `${Math.round(((i + 1) / total) * 100)}%`;
      scrollLog();
    }

    if (token !== runToken) {
      return;
    }

    renderResult(agent.result);
    setStatus("done", "COMPLETE");
    runButton.disabled = false;
    runButton.textContent = "Run again";
  }

  rosterItems.forEach((item) => {
    item.addEventListener("click", () => selectAgent(item.dataset.agent));
  });
  runButton.addEventListener("click", runAgent);
  selectAgent("scout");
}

restoreWallet();
