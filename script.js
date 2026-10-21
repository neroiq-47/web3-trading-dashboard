const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = solanaWeb3;

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

let provider, publicKey, connection, walletLabel = '';
let botInterval;
let chart, lineSeries;

const connectPhantomBtn = document.getElementById('connectPhantom');
const connectJupiterBtn = document.getElementById('connectJupiter');
const walletInfo = document.getElementById('walletInfo');
const walletNameEl = document.getElementById('walletName');
const addressEl = document.getElementById('address');
const solBalEl = document.getElementById('solBal');
const usdcBalEl = document.getElementById('usdcBal');
const logEl = document.getElementById('log');
const startBtn = document.getElementById('startBot');
const stopBtn = document.getElementById('stopBot');
const withdrawBtn = document.getElementById('withdrawBtn');

if ('Notification' in window && Notification.permission !== 'granted') {
  Notification.requestPermission();
}

function getHeliusKey() {
  return document.getElementById('heliusKey').value.trim();
}
function getJupKey() {
  return document.getElementById('jupKey').value.trim();
}
function getRpc() {
  const key = getHeliusKey();
  return key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : 'https://api.mainnet-beta.solana.com';
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

function getJupiterProvider() {
  // Jupiter Wallet extension injects under window.jupiter or window.jup
  if (window.jupiter?.solana) return window.jupiter.solana;
  if (window.jup?.solana) return window.jup.solana;
  // Some builds expose isJupiter on the solana provider
  if (window.solana?.isJupiter) return window.solana;
  return null;
}

async function connectWallet(getProviderFn, label, installUrl) {
  const wallet = getProviderFn();
  if (!wallet) {
    alert(`Install ${label} wallet`);
    if (installUrl) window.open(installUrl, '_blank');
    return;
  }
  try {
    provider = wallet;
    const resp = await provider.connect();
    publicKey = new PublicKey(resp.publicKey.toString());
    connection = new Connection(getRpc(), 'confirmed');
    walletLabel = label;
    walletNameEl.textContent = label;
    addressEl.textContent = publicKey.toString().slice(0, 6) + '...' + publicKey.toString().slice(-4);
    walletInfo.classList.remove('hidden');
    connectPhantomBtn.textContent = label === 'Phantom' ? 'Connected' : 'Connect Phantom';
    connectJupiterBtn.textContent = label === 'Jupiter' ? 'Connected' : 'Connect Jupiter';
    await refreshBalances();
    log(label + ' connected');
  } catch (e) {
    alert('Connection failed');
    console.error(e);
  }
}

connectPhantomBtn.onclick = () => connectWallet(
  () => window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null),
  'Phantom',
  'https://phantom.app'
);

connectJupiterBtn.onclick = () => connectWallet(
  getJupiterProvider,
  'Jupiter',
  'https://jup.ag/wallet'
);

async function refreshBalances() {
  if (!publicKey || !connection) return;
  try {
    const sol = await connection.getBalance(publicKey);
    solBalEl.textContent = (sol / LAMPORTS_PER_SOL).toFixed(4);
    const accounts = await connection.getParsedTokenAccountsByOwner(publicKey, { mint: new PublicKey(USDC_MINT) });
    let usdc = 0;
    if (accounts.value.length) {
      usdc = accounts.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
    }
    usdcBalEl.textContent = usdc.toFixed(2);
  } catch (e) {
    console.error(e);
  }
}

async function loadCoins() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=solana,usd-coin&order=market_cap_desc');
    if (!res.ok) throw new Error('API');
    const coins = await res.json();
    const el = document.getElementById('coins');
    el.innerHTML = '';
    coins.forEach(c => {
      const card = document.createElement('div');
      card.className = 'coin-card';
      const change = c.price_change_percentage_24h ?? 0;
      card.innerHTML = `<h3>${c.symbol.toUpperCase()}</h3><p>$${c.current_price.toLocaleString()}</p><p style="color:${change >= 0 ? '#00ff00' : '#ff4444'}">${change.toFixed(2)}%</p>`;
      el.appendChild(card);
    });
  } catch (e) {
    document.getElementById('coins').innerHTML = '<p>Market data busy. Retrying soon.</p>';
  }
}
loadCoins();
setInterval(loadCoins, 90000);

function initChart() {
  const container = document.getElementById('priceChart');
  if (!window.LightweightCharts) return;
  chart = LightweightCharts.createChart(container, {
    layout: { background: { color: '#111' }, textColor: '#e0e0e0' },
    grid: { vertLines: { color: '#333' }, horzLines: { color: '#333' } },
    width: container.clientWidth,
    height: 220,
    rightPriceScale: { borderColor: '#6a0dad' },
    timeScale: { borderColor: '#6a0dad' }
  });
  lineSeries = chart.addLineSeries({ color: '#ffd700', lineWidth: 2 });
  window.addEventListener('resize', () => chart?.applyOptions({ width: container.clientWidth }));
}

async function updateChart(coinId) {
  if (!chart) initChart();
  if (!lineSeries) return;
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=1`);
    if (!res.ok) return;
    const data = await res.json();
    const prices = (data.prices || []).map(p => ({ time: Math.floor(p[0] / 1000), value: p[1] }));
    if (prices.length) {
      lineSeries.setData(prices);
      chart.timeScale().fitContent();
    }
  } catch (e) {}
}

async function jupiterSwap(inputMint, outputMint, amountRaw) {
  if (!provider || !publicKey) { log('Connect wallet first'); return; }
  const jupKey = getJupKey();
  if (!jupKey) { log('Enter Jupiter API key'); return; }
  try {
    const quoteUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRaw}&slippageBps=100`;
    const quoteRes = await fetch(quoteUrl, { headers: { 'x-api-key': jupKey } });
    if (!quoteRes.ok) throw new Error('Quote failed');
    const quote = await quoteRes.json();

    const swapRes = await fetch('https://api.jup.ag/swap/v1/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': jupKey },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: publicKey.toString(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true
      })
    });
    if (!swapRes.ok) throw new Error('Swap build failed');
    const { swapTransaction } = await swapRes.json();

    const txBuf = Uint8Array.from(atob(swapTransaction), c => c.charCodeAt(0));
    const tx = solanaWeb3.VersionedTransaction.deserialize(txBuf);
    log('Prompting ' + walletLabel + ' to sign...');
    const signed = await provider.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize());
    log('Tx: ' + sig);
    await connection.confirmTransaction(sig, 'confirmed');
    log('Swap confirmed');
    notify('Swap confirmed', sig);
    await refreshBalances();
  } catch (e) {
    log('Swap failed: ' + (e.message || 'error'));
    console.error(e);
  }
}

startBtn.onclick = () => {
  const coin = document.getElementById('coinId').value.trim();
  const buy = parseFloat(document.getElementById('buyBelow').value);
  const sell = parseFloat(document.getElementById('sellAbove').value);
  const usdcAmt = parseFloat(document.getElementById('tradeUsdc').value) || 10;
  const auto = document.getElementById('autoTrade').checked;
  const tokenMint = document.getElementById('tokenMint').value.trim();
  if (!coin || !tokenMint) { log('Fill coin and mint'); return; }
  if (botInterval) clearInterval(botInterval);
  log('Monitor started' + (auto ? ' (auto ON)' : ''));
  updateChart(coin);
  botInterval = setInterval(async () => {
    try {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd`);
      if (!res.ok) { log('Price busy'); return; }
      const data = await res.json();
      const price = data[coin]?.usd;
      if (!price) { log('Coin not found'); return; }
      log(`${coin}: $${price}`);
      const amountRaw = Math.floor(usdcAmt * 1e6);
      if (buy && price < buy) {
        const msg = `BUY SIGNAL: ${coin} below ${buy}`;
        log(msg);
        notify('Buy Signal', msg);
        if (auto) await jupiterSwap(USDC_MINT, tokenMint, amountRaw);
      }
      if (sell && price > sell) {
        const msg = `SELL SIGNAL: ${coin} above ${sell}`;
        log(msg);
        notify('Sell Signal', msg);
        if (auto && tokenMint === SOL_MINT) {
          const solRaw = Math.floor((usdcAmt / price) * LAMPORTS_PER_SOL);
          await jupiterSwap(SOL_MINT, USDC_MINT, solRaw);
        }
      }
      updateChart(coin);
    } catch (e) { log('Price error'); }
  }, 45000);
};

stopBtn.onclick = () => {
  if (botInterval) clearInterval(botInterval);
  log('Stopped');
};

withdrawBtn.onclick = async () => {
  if (!provider || !publicKey || !connection) { log('Connect wallet first'); return; }
  const to = document.getElementById('withdrawTo').value.trim();
  const amt = parseFloat(document.getElementById('withdrawAmt').value);
  if (!to || !amt || amt <= 0) { log('Invalid withdraw'); return; }
  try {
    const toPk = new PublicKey(to);
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: toPk,
        lamports: Math.floor(amt * LAMPORTS_PER_SOL)
      })
    );
    tx.feePayer = publicKey;
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    log('Prompting ' + walletLabel + ' for withdraw...');
    const signed = await provider.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize());
    log('Withdraw tx: ' + sig);
    await connection.confirmTransaction(sig, 'confirmed');
    log('Withdraw confirmed');
    await refreshBalances();
  } catch (e) {
    log('Withdraw failed: ' + (e.message || 'error'));
  }
};

updateChart('solana');
