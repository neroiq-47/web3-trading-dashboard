# Web3 Trading Bot

Simple live MetaMask + Uniswap dashboard.

## Deploy to Cloudflare Pages

1. Go to Cloudflare dashboard → Workers & Pages → Create application → Pages → Connect to Git.
2. Authorize GitHub and select this repo (`web3-trading-dashboard`).
3. Settings:
   - Production branch: `main`
   - Build command: *(leave empty)*
   - Build output directory: `/` (root)
4. Save and Deploy.

Every push to `main` auto-deploys.

Site will be at `https://web3-trading-dashboard.pages.dev` (or your custom domain).
