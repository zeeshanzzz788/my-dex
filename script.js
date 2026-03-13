// ==================== script.js ====================
// Full logic for Sidra DEX - WalletConnect v2 + Native SDA + Live Prices

const PROJECT_ID = "3bb945c291d5b5de4571c578f288c3ff";

const ROUTER_ADDRESS = "0x35cAC72Db00e8dAC0e4f7F8A0F53D339E0cC23fb";
const WSDA_ADDRESS = "0xE4095a910209D7BE03B55D02F40d4554B1666182";

const CHAIN_ID = 97453;
const RPC_URL = "https://node.sidrachain.com";
const EXPLORER = "https://ledger.sidrachain.com";

const ROUTER_ABI = [
  "function getAmountsOut(uint amountIn, address[] path) view returns (uint[] memory)",
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] memory)",
  "function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[] memory)",
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] memory)"
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

const tokens = [
  { address: null, symbol: "SDA", name: "Sidra Digital Assets", decimals: 18, logo: "https://placehold.co/64x64/00ffaa/000000?text=SDA", isNative: true },
  { address: "0xE4095a910209D7BE03B55D02F40d4554B1666182", symbol: "WSDA", name: "Wrapped SDA", decimals: 18, logo: "https://placehold.co/64x64/00ff88/000000?text=WSDA", isNative: false },
  { address: "0x345b20d4fca08376f19145c36c531a1821af96c4", symbol: "VPD", name: "VPD Token", decimals: 18, logo: "https://placehold.co/64x64/ffcc00/000000?text=VPD", isNative: false },
  { address: "0xf74106911432657a24b0d85257d40f24f801cc01", symbol: "MBF", name: "EBMOF", decimals: 18, logo: "https://placehold.co/64x64/aa00ff/000000?text=MBF", isNative: false },
  { address: "0xb6f440a059d24ca305bce6f25115d09e9dbea653", symbol: "ECSDA", name: "ECOSIDRA", decimals: 18, logo: "https://placehold.co/64x64/00aaff/000000?text=ECSDA", isNative: false },
  { address: "0x9b61324f0bee10f4624fe6e75c60943b73125e81", symbol: "ARMS", name: "Sidra Aram Travel", decimals: 18, logo: "https://placehold.co/64x64/aaff00/000000?text=ARMS", isNative: false },
  { address: "0x88a53e067a6d2be71248d7b660ae72cc47f82d88", symbol: "NGEC", name: "NEWGEN GLOBAL MARKETING", decimals: 18, logo: "https://placehold.co/64x64/ff00aa/000000?text=NGEC", isNative: false }
];

let provider, signer, routerContract, wcProvider;
let fromToken = null, toToken = null;
let currentSlippage = 1;

// ==================== CONNECT WALLET (Official Modal - No more blank/stuck) ====================
async function connectWallet() {
  const btnText = document.getElementById("connectText");
  btnText.textContent = "Connecting...";

  try {
    if (window.ethereum) {
      provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
    } else {
      const { EthereumProvider } = await import("https://esm.sh/@walletconnect/ethereum-provider@2.23.7");
      
      wcProvider = await EthereumProvider.init({
        projectId: PROJECT_ID,
        chains: [CHAIN_ID],
        showQrModal: true,
        rpcMap: { [CHAIN_ID]: RPC_URL }
      });

      await wcProvider.connect();
      provider = new ethers.BrowserProvider(wcProvider);
    }

    signer = await provider.getSigner();
    routerContract = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);

    const addr = await signer.getAddress();
    document.getElementById("connectText").innerHTML = `✅ ${addr.slice(0,6)}...${addr.slice(-4)}`;
    document.getElementById("disconnectBtn").classList.remove("hidden");
    document.getElementById("swapBtnText").textContent = "Swap Now";

    initDefaultTokens();
    loadBalances();
  } catch (e) {
    console.error(e);
    alert("Connection failed.\n\nMake sure your wallet is unlocked.\nError: " + (e.message || e));
    document.getElementById("connectText").textContent = "Connect Wallet";
  }
}

function disconnectWallet() {
  if (wcProvider) wcProvider.disconnect();
  window.location.reload();
}

// ==================== TOKEN MODAL ====================
function showTokenModal(isFrom) {
  document.getElementById("tokenModal").classList.remove("hidden");
  window.currentModalTarget = isFrom;
  renderTokenList();
}

function closeModal() {
  document.getElementById("tokenModal").classList.add("hidden");
}

function renderTokenList() {
  const list = document.getElementById("tokenList");
  list.innerHTML = "";
  const search = document.getElementById("searchInput").value.toUpperCase().trim();

  tokens.filter(t => 
    t.symbol.toUpperCase().includes(search) || 
    t.name.toUpperCase().includes(search)
  ).forEach(token => {
    const div = document.createElement("div");
    div.className = "token-item flex items-center gap-5 px-6 py-5 cursor-pointer";
    div.innerHTML = `
      <img src="${token.logo}" class="w-12 h-12 rounded-2xl">
      <div>
        <div class="font-semibold text-xl">${token.symbol}</div>
        <div class="text-xs text-zinc-400">${token.name}</div>
      </div>
    `;
    div.onclick = () => {
      if (window.currentModalTarget) {
        fromToken = token;
        document.getElementById("fromSymbol").textContent = token.symbol;
        document.getElementById("fromLogo").src = token.logo;
      } else {
        toToken = token;
        document.getElementById("toSymbol").textContent = token.symbol;
        document.getElementById("toLogo").src = token.logo;
      }
      closeModal();
      if (fromToken && toToken && fromToken.symbol !== toToken.symbol) getLiveQuote();
    };
    list.appendChild(div);
  });
}

// ==================== LIVE PRICE & ESTIMATE ====================
async function getLiveQuote() {
  if (!fromToken || !toToken || !signer || fromToken.symbol === toToken.symbol) return;

  const amountStr = document.getElementById("fromAmount").value.trim();
  if (!amountStr || parseFloat(amountStr) <= 0) return;

  const amountIn = ethers.parseUnits(amountStr, fromToken.decimals);
  const path = fromToken.isNative 
    ? [WSDA_ADDRESS, toToken.address] 
    : toToken.isNative 
      ? [fromToken.address, WSDA_ADDRESS] 
      : [fromToken.address, toToken.address];

  try {
    const amountsOut = await routerContract.getAmountsOut(amountIn, path);
    const estimated = ethers.formatUnits(amountsOut[1], toToken.decimals);
    
    document.getElementById("toAmount").value = parseFloat(estimated).toFixed(6);
    const price = (parseFloat(estimated) / parseFloat(amountStr)).toFixed(4);
    
    document.getElementById("livePrice").textContent = price;
    document.getElementById("priceFromSymbol").textContent = fromToken.symbol;
    document.getElementById("priceToSymbol").textContent = toToken.symbol;
    document.getElementById("estimateText").innerHTML = `≈ ${estimated} ${toToken.symbol}`;
  } catch (e) {
    document.getElementById("estimateText").textContent = "No liquidity";
  }
}

let quoteTimeout;
document.getElementById("fromAmount").addEventListener("input", () => {
  clearTimeout(quoteTimeout);
  quoteTimeout = setTimeout(getLiveQuote, 300);
});

// ==================== BALANCES & SWAP ====================
function isNative(t) { return t && t.isNative; }

async function loadBalances() {
  if (!signer || !fromToken || !toToken) return;
  const addr = await signer.getAddress();

  const balFrom = isNative(fromToken) 
    ? await provider.getBalance(addr) 
    : await new ethers.Contract(fromToken.address, ERC20_ABI, provider).balanceOf(addr);

  const balTo = isNative(toToken) 
    ? await provider.getBalance(addr) 
    : await new ethers.Contract(toToken.address, ERC20_ABI, provider).balanceOf(addr);

  document.getElementById("fromBalance").textContent = `Balance: ${ethers.formatUnits(balFrom, fromToken.decimals).slice(0,9)} ${fromToken.symbol}`;
  document.getElementById("toBalance").textContent = `Balance: ${ethers.formatUnits(balTo, toToken.decimals).slice(0,9)} ${toToken.symbol}`;
}

async function executeSwap() {
  const btn = document.getElementById("swapBtn");
  btn.disabled = true;
  document.getElementById("swapBtnText").textContent = "Swapping...";

  try {
    const amountStr = document.getElementById("fromAmount").value.trim();
    const amountIn = ethers.parseUnits(amountStr, fromToken.decimals);
    const estOut = parseFloat(document.getElementById("toAmount").value);
    const amountOutMin = ethers.parseUnits((estOut * (1 - currentSlippage/100)).toFixed(6), toToken.decimals);
    const path = isNative(fromToken) ? [WSDA_ADDRESS, toToken.address] : isNative(toToken) ? [fromToken.address, WSDA_ADDRESS] : [fromToken.address, toToken.address];
    const deadline = Math.floor(Date.now()/1000) + 600;
    const toAddr = await signer.getAddress();

    if (!isNative(fromToken)) {
      const erc = new ethers.Contract(fromToken.address, ERC20_ABI, signer);
      if (await erc.allowance(toAddr, ROUTER_ADDRESS) < amountIn) {
        document.getElementById("swapBtnText").textContent = "Approving...";
        await (await erc.approve(ROUTER_ADDRESS, amountIn)).wait();
      }
    }

    let tx;
    if (isNative(fromToken)) {
      tx = await routerContract.swapExactETHForTokens(amountOutMin, path, toAddr, deadline, { value: amountIn });
    } else if (isNative(toToken)) {
      tx = await routerContract.swapExactTokensForETH(amountIn, amountOutMin, path, toAddr, deadline);
    } else {
      tx = await routerContract.swapExactTokensForTokens(amountIn, amountOutMin, path, toAddr, deadline);
    }

    const receipt = await tx.wait();
    alert(`✅ Swap Successful!\n\nTx: ${EXPLORER}/tx/${receipt.hash}`);
    loadBalances();
    getLiveQuote();
  } catch (e) {
    alert("Swap failed: " + (e.message || e));
  } finally {
    btn.disabled = false;
    document.getElementById("swapBtnText").textContent = "Swap Now";
  }
}

function setSlippage(val) {
  currentSlippage = val;
}

function initDefaultTokens() {
  fromToken = tokens[0];
  document.getElementById("fromSymbol").textContent = "SDA";
  document.getElementById("fromLogo").src = tokens[0].logo;
}

// ==================== EVENT LISTENERS ====================
document.getElementById("connectBtn").onclick = connectWallet;
document.getElementById("fromTokenBtn").onclick = () => showTokenModal(true);
document.getElementById("toTokenBtn").onclick = () => showTokenModal(false);
document.getElementById("swapTokensBtn").onclick = () => {
  [fromToken, toToken] = [toToken, fromToken];
  document.getElementById("fromSymbol").textContent = fromToken ? fromToken.symbol : "SDA";
  document.getElementById("toSymbol").textContent = toToken ? toToken.symbol : "Select Token";
  document.getElementById("fromLogo").src = fromToken ? fromToken.logo : "";
  document.getElementById("toLogo").src = toToken ? toToken.logo : "";
  if (fromToken && toToken) getLiveQuote();
};
document.getElementById("searchInput").addEventListener("input", renderTokenList);
setInterval(() => { if (signer) loadBalances(); }, 8000);

// Tailwind ready
tailwind.config = { content: ["*"] };