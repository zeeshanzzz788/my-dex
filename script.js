// script.js - Latest WalletConnect 2.23.8 (March 2026)

const PROJECT_ID = "3bb945c291d5b5de4571c578f288c3ff";

const ROUTER_ADDRESS = "0x35cAC72Db00e8dAC0e4f7F8A0F53D339E0cC23fb";
const WSDA_ADDRESS = "0xE4095a910209D7BE03B55D02F40d4554B1666182";

const CHAIN_ID = 97453;
const RPC_URL = "https://node.sidrachain.com";
const EXPLORER = "https://ledger.sidrachain.com";

const ROUTER_ABI = ["function getAmountsOut(uint amountIn, address[] path) view returns (uint[] memory)","function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] memory)","function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[] memory)","function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] memory)"];
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)","function allowance(address owner, address spender) view returns (uint256)","function approve(address spender, uint256 amount) returns (bool)"];

const tokens = [ /* same 7 tokens as before - copy from your previous script.js */ ];

let provider, signer, routerContract, wcProvider;
let fromToken = null, toToken = null;
let currentSlippage = 1;

// ==================== CONNECT WALLET (Latest + Official Modal) ====================
async function connectWallet() {
  const btnText = document.getElementById("connectText");
  btnText.textContent = "Opening WalletConnect...";

  try {
    if (window.ethereum) {
      provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
    } else {
      const { EthereumProvider } = await import("https://esm.sh/@walletconnect/ethereum-provider@2.23.8");
      
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
    btnText.innerHTML = `✅ ${addr.slice(0,6)}...${addr.slice(-4)}`;
    document.getElementById("disconnectBtn").classList.remove("hidden");
    document.getElementById("swapBtnText").textContent = "Swap Now";

    initDefaultTokens();
    loadBalances();
  } catch (e) {
    console.error(e);
    alert("Connection failed.\n\n• Wallet must be unlocked\n• Try MetaMask or Trust Wallet\nError: " + (e.message || e));
    btnText.textContent = "Connect Wallet";
  }
}

function disconnectWallet() {
  if (wcProvider) wcProvider.disconnect();
  window.location.reload();
}

// Rest of the code (token modal, live quote, swap, balances) - exactly the same as your previous working script.js
// (copy the rest from your last script.js - initDefaultTokens, showTokenModal, getLiveQuote, loadBalances, executeSwap, etc.)

// Event listeners at the bottom same as before