# Kitchen Planner progress

Mark an item done only after checking it. Add one short evidence note with a test result, screen, saved database record or live URL.

- [ ] Three project files created and reviewed. Evidence: Reviewed `Kitchen_Planner_Design.md` and the three seed JSON files in `operating data/` (`scenario.json`, `products_and_recipes.json`, `supplier.json`). Required `DESIGN.md` and `Kitchen_Planner_Learner_Brief.md` are missing, so this step is not complete.
- [x] App scaffold runs. Evidence: Started with `npm start` using Node.js v24.22.1. `node --check server.js` passed; local homepage returned HTTP 200 and contained “Weekly kitchen plan”; `/api/plan` returned 15 eligible orders, 1 excluded order, 5,280 units and stock packs of 20 bread, 2 cheese, 0 egg and 2 chicken.
- [ ] Stock, HR and CRM imports validate, save to Postgres and survive reload. Evidence: The five supplied sample file types passed validation (stock 4, staff 7, leave 2, availability 6, CRM 16), and an invalid CRM upload returned HTTP 400. Neon Free is connected. A synthetic CRM export saved to PostgreSQL, was read from a fresh process, remained one row after duplicate import, and was removed. Upload/reload of all five types through the deployed app remains to be verified.
- [ ] Verified calculations match the supplied rules. Evidence: Independent CSV/JSON arithmetic check passed for cutoff, total units, labour and stock packs. Full roster/business-rule verification awaits the missing learner brief.
- [ ] Run planning agents calls OpenAI and shows three recommendations and a handoff trace. Evidence: The local **Test OpenAI** button uses the server-side Responses API and `OPENAI_API_KEY`. Syntax, key-not-in-page and missing-key checks passed; after the key was configured, the live API returned “OpenAI connection successful.” Full three-agent planning and handoff trace remain to be implemented.
- [ ] Dashboard shows next-week plan, exceptions and action list. Evidence:
- [ ] GitHub repository and Vercel frontend/backend work. URL and evidence: `https://github.com/junxiong1982/kitchenhelper` is connected to local Git. Existing Vercel project `kitchenhelper` is linked locally; Neon Free, APP_PASSWORD and OPENAI_API_KEY are configured as server-side settings. A clean Vercel preview build succeeded with zero private operating files and exactly three approved reference JSON files. Deployment URL and live checks remain pending.
- [ ] Gmail draft appears unsent in my connected Gmail. Evidence:

Next step:
Push the clean-build changes, connect `kitchenhelper` to the GitHub repository, deploy, then upload stock/HR/CRM samples through the protected deployed app and verify that saved imports survive reload. `DESIGN.md` and `Kitchen_Planner_Learner_Brief.md` remain missing; `Kitchen_Planner_Design.md` supplies the available guidance.
Blocker, if any: No deployment URL or live import check exists yet. Do not mark imports or deployment complete until a working hosted database and live reload are verified.
