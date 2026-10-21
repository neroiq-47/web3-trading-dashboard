# Solana Trader

Live Solana dashboard. Phantom wallet. USDC funding. Simple SOL withdrawals. Jupiter auto-trades (wallet prompt each time).

## Deploy (Cloudflare Pages)

1. Workers & Pages → Create → Pages → Connect to Git
2. Select this repo, branch `main`
3. Build command: empty
4. Output directory: `/`
5. Deploy

## Use

1. Open the site
2. Connect Phantom
3. Paste Jupiter + Helius keys (stored only in your browser session)
4. Fund by sending USDC to your address (keep some SOL for fees)
5. Set buy/sell prices and USDC trade size
6. Start Monitor — signals can auto-prompt Jupiter swaps
7. Withdraw SOL anytime

Keys are never written to the repo.
