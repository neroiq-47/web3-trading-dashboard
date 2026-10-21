let provider, signer, address;
let botInterval;

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

function log(msg) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = new Date().toLocaleTimeString() + ': ' + msg;
  logEl.prepend(entry);
}

startBtn.onclick = () => {
  const coin = document.getElementById('coinId').value.trim();
  const buy = parseFloat(document.getElementById('buyBelow').value);
  const sell = parseFloat(document.getElementById('sellAbove').value);
  if (!coin) return;
  if (botInterval) clearInterval(botInterval);
  log('Bot started for ' + coin);
  botInterval = setInterval(async () => {
    try {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd`);
      const data = await res.json();
      const price = data[coin]?.usd;
      if (!price) { log('Coin not found'); return; }
      log(`${coin}: $${price}`);
      if (buy && price < buy) log(`BUY SIGNAL: ${coin} below ${buy}`);
      if (sell && price > sell) log(`SELL SIGNAL: ${coin} above ${sell}`);
    } catch (e) { log('Price fetch error'); }
  }, 30000);
};

stopBtn.onclick = () => {
  if (botInterval) clearInterval(botInterval);
  log('Bot stopped');
};

// Note: Full live swaps require Uniswap Router integration and user confirmation per tx.
// This dashboard is ready for you to fund via MetaMask and extend with trading logic.