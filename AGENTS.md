<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules

- Tradable assets are whitelisted in the Supabase `market_assets` table. `execute_exchange` rejects any symbol without an `active` row there ("asset X not available"). To add a coin, insert an active row (symbol, name, coingecko_id, sort_order); deposit_address may be null, which hides it from deposits until a real address is set.
