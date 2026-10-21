let provider, signer, address;
let botInterval;
let chart, lineSeries;

const UNISWAP_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

const ROUTER_ABI = [
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
];

const connectBtn = document.getElementById('connectBtn');
const walletInfo = document.getElementById('walletInfo');
const addressEl = document.getElementById('address');
const balanceEl = document.getElementById('balance');
const coinsEl = document.getElementById('coins');
const logEl = document.getElementById('log');
const startBtn = document.getElementById('startBot');
const stopBtn = document.getElementById('stopBot');

if ('Notification' in window && Notification.permission !== 'granted') {
  Notification.requestPermission();
}

async function refreshBalance() {
  if (!provider || !address) return;
  try {
    const bal = await provider.getBalance(address);
    balanceEl.textContent = parseFloat(ethers.utils.formatEther(bal)).toFixed(4);
  } catch (e) {}
}

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
    await refreshBalance();
    walletInfo.classList.remove('hidden');
    connectBtn.textContent = 'Connected';
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
    const res = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=6&page=1&sparkline=false');
    if (!res.ok) throw new Error('API ' + res.status);
    const coins = await res.json();
    coinsEl.innerHTML = '';
    coins.forEach(c => {
      const card = document.createElement('div');
      card.className = 'coin-card';
      const change = c.price_change_percentage_24h ?? 0;
      card.innerHTML = `<h3>${c.symbol.toUpperCase()}</h3><p>$${c.current_price.toLocaleString()}</p><p style="color:${change >= 0 ? '#00ff00' : '#ff4444'}">${change.toFixed(2)}%</p>`;
      coinsEl.appendChild(card);
    });
  } catch (e) {
    coinsEl.innerHTML = '<p>Market data unavailable (rate limit). Try again in a minute.</p>';
    console.error(e);
  }
}

loadCoins();
setInterval(loadCoins, 90000);

function initChart() {
  const container = document.getElementById('priceChart');
  if (!window.LightweightCharts) {
    log('Chart library not loaded');
    return;
  }
  chart = LightweightCharts.createChart(container, {
    layout: { background: { color: '#111' }, textColor: '#e0e0e0' },
    grid: { vertLines: { color: '#333' }, horzLines: { color: '#333' } },
    width: container.clientWidth,
    height: 220,
    rightPriceScale: { borderColor: '#6a0dad' },
    timeScale: { borderColor: '#6a0dad' }
  });
  lineSeries = chart.addLineSeries({ color: '#ffd700', lineWidth: 2 });
  window.addEventListener('resize', () => {
    if (chart) chart.applyOptions({ width: container.clientWidth });
  });
}

async function updateChart(coinId) {
  if (!chart) initChart();
  if (!chart || !lineSeries) return;
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=1`);
    if (!res.ok) throw new Error('Chart API ' + res.status);
    const data = await res.json();
    const prices = (data.prices || []).map(p => ({ time: Math.floor(p[0] / 1000), value: p[1] }));
    if (prices.length) {
      lineSeries.setData(prices);
      chart.timeScale().fitContent();
    }
  } catch (e) {
    console.error(e);
    log('Chart unavailable');
  }
}

function log(msg) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = new Date().toLocaleTimeString() + ': ' + msg;
  logEl.prepend(entry);
}

function notify(title, body) {
  if (document.getElementById('notify')?.checked && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

async function executeBuy(amountEth, tokenAddress) {
  if (!signer) { log('Connect wallet first'); return; }
  if (!tokenAddress || !tokenAddress.startsWith('0x') || tokenAddress.length !== 42) {
    log('Invalid token address');
    return;
  }
  try {
    const router = new ethers.Contract(UNISWAP_ROUTER, ROUTER_ABI, signer);
    const path = [WETH, tokenAddress];
    const value = ethers.utils.parseEther(amountEth.toString());
    // Get quote for 5% slippage protection
    const amounts = await router.getAmountsOut(value, path);
    const amountOutMin = amounts[1].mul(95).div(100);
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    log('Prompting MetaMask for BUY (5% slippage max)...');
    const tx = await router.swapExactETHForTokens(
      amountOutMin,
      path,
      address,
      deadline,
      { value }
    );
    log('Tx sent: ' + tx.hash);
    await tx.wait();
    log('BUY confirmed');
    notify('BUY confirmed', tx.hash);
    await refreshBalance();
  } catch (e) {
    log('BUY failed: ' + (e.reason || e.message || 'unknown'));
  }
}

startBtn.onclick = async () => {
  const coin = document.getElementById('coinId').value.trim();
  const buy = parseFloat(document.getElementById('buyBelow').value);
  const sell = parseFloat(document.getElementById('sellAbove').value);
  const amount = parseFloat(document.getElementById('tradeAmount').value) || 0.01;
  const auto = document.getElementById('autoTrade').checked;
  const tokenAddr = document.getElementById('tokenAddress').value.trim();
  if (!coin) { log('Enter a coin ID'); return; }
  if (botInterval) clearInterval(botInterval);
  log('Bot started for ' + coin + (auto ? ' (auto-trade ON)' : ''));
  updateChart(coin);
  botInterval = setInterval(async () => {
    try {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd`);
      if (!res.ok) { log('Price API busy'); return; }
      const data = await res.json();
      const price = data[coin]?.usd;
      if (!price) { log('Coin not found'); return; }
      log(`${coin}: $${price}`);
      if (buy && price < buy) {
        const msg = `BUY SIGNAL: ${coin} below ${buy}`;
        log(msg);
        notify('Buy Signal', msg);
        if (auto) await executeBuy(amount, tokenAddr);
      }
      if (sell && price > sell) {
        const msg = `SELL SIGNAL: ${coin} above ${sell}`;
        log(msg);
        notify('Sell Signal', msg);
      }
      updateChart(coin);
    } catch (e) { log('Price fetch error'); }
  }, 45000);
};

stopBtn.onclick = () => {
  if (botInterval) clearInterval(botInterval);
  log('Bot stopped');
};

updateChart('ethereum');
