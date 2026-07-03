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

restoreWallet();
