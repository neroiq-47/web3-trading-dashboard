let provider, signer, address;
let botInterval;
let priceChart;

const UNISWAP_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // example for stable

const ROUTER_ABI = [
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'
];

const connectBtn = document.getElementById('connectBtn');
const walletInfo = document.getElementById('walletInfo');
const addressEl = document.getElementById('address');
const balanceEl = document.getElementById('balance');
const coinsEl = document.getElementById('coins');
const logEl = document.getElementById('log');
const startBtn = document.getElementById('startBot');
const stopBtn = document.getElementById('stopBot');

connectBtn.onclick = async () => {
  if (!window.ethereum) {
    alert('Install MetaMask to use live');
    return;
  }
  try {
    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    signer = provider.getSigner();
    address = await signer.getAddress();
    addressEl.textContent = address.slice(0, 6) + '...' + address.slice(-4);
    const bal = await provider.getBalance(address);
    balanceEl.textContent = parseFloat(ethers.utils.formatEther(bal)).toFixed(4);
    walletInfo.classList.remove('hidden');
    connectBtn.textContent = 'Connected';
    // Switch to mainnet if needed
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1' }] });
    } catch (e) { console.log('Chain switch skipped'); }
  } catch (e) {
    console.error(e);
    alert('Connection failed');
  }
};

async function loadCoins() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=6&page=1');
    const coins = await res.json();
    coinsEl.innerHTML = '';
    coins.forEach(c => {
      const card = document.createElement('div');
      card.className = 'coin-card';
      card.innerHTML = `<h3>${c.symbol.toUpperCase()}</h3><p>$${c.current_price.toLocaleString()}</p><p style="color:${c.price_change_percentage_24h >= 0 ? '#00ff00' : '#ff4444'}">${c.price_change_percentage_24h.toFixed(2)}%</p>`;
      coinsEl.appendChild(card);
    });
  } catch (e) {
    coinsEl.innerHTML = '<p>Failed to load prices</p>';
  }
}

loadCoins();
setInterval(loadCoins, 60000);

async function updateChart(coinId) {
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=1`);
    const data = await res.json();
    const prices = data.prices || [];
    const labels = prices.map(p => new Date(p[0]).toLocaleTimeString());
    const values = prices.map(p => p[1]);

    const ctx = document.getElementById('priceChart').getContext('2d');
    if (priceChart) priceChart.destroy();
    priceChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: coinId + ' USD',
          data: values,
          borderColor: '#ffd700',
          backgroundColor: 'rgba(106, 13, 173, 0.2)',
          tension: 0.1,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: '#e0e0e0' } } },
        scales: {
          x: { ticks: { color: '#888', maxTicksLimit: 8 } },
          y: { ticks: { color: '#888' } }
        }
      }
    });
  } catch (e) {
    console.error(e);
    log('Chart load failed');
  }
}

function log(msg) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = new Date().toLocaleTimeString() + ': ' + msg;
  logEl.prepend(entry);
}

async function executeBuy(amountEth) {
  if (!signer) { log('Connect wallet first'); return; }
  try {
    const router = new ethers.Contract(UNISWAP_ROUTER, ROUTER_ABI, signer);
    const path = [WETH, USDC]; // ETH -> USDC as example; replace with target token
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    const value = ethers.utils.parseEther(amountEth.toString());
    log('Prompting MetaMask for BUY swap...');
    const tx = await router.swapExactETHForTokens(
      0, // amountOutMin (set higher for production)
      path,
      address,
      deadline,
      { value }
    );
    log('Tx sent: ' + tx.hash);
    await tx.wait();
    log('BUY confirmed');
  } catch (e) {
    log('BUY failed: ' + (e.reason || e.message));
  }
}

// Simple sell would require token approval + swapExactTokensForETH; omitted for minimal version
// Extend as needed for specific tokens.

startBtn.onclick = async () => {
  const coin = document.getElementById('coinId').value.trim();
  const buy = parseFloat(document.getElementById('buyBelow').value);
  const sell = parseFloat(document.getElementById('sellAbove').value);
  const amount = parseFloat(document.getElementById('tradeAmount').value) || 0.01;
  const auto = document.getElementById('autoTrade').checked;
  if (!coin) return;
  if (botInterval) clearInterval(botInterval);
  log('Bot started for ' + coin + (auto ? ' (auto-trade ON)' : ''));
  updateChart(coin);
  botInterval = setInterval(async () => {
    try {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd`);
      const data = await res.json();
      const price = data[coin]?.usd;
      if (!price) { log('Coin not found'); return; }
      log(`${coin}: $${price}`);
      if (buy && price < buy) {
        log(`BUY SIGNAL: ${coin} below ${buy}`);
        if (auto) await executeBuy(amount);
      }
      if (sell && price > sell) {
        log(`SELL SIGNAL: ${coin} above ${sell}`);
        // Sell requires token balance + approval; implement per token
      }
      updateChart(coin);
    } catch (e) { log('Price fetch error'); }
  }, 30000);
};

stopBtn.onclick = () => {
  if (botInterval) clearInterval(botInterval);
  log('Bot stopped');
};

// Initial chart
updateChart('ethereum');
