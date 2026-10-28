# Kitchen Planner progress

Mark an item done only after checking it. Add one short evidence note with a test result, screen, saved database record or live URL.

- [ ] Three project files created and reviewed. Evidence: Reviewed `Kitchen_Planner_Design.md` and the three seed JSON files in `operating data/` (`scenario.json`, `products_and_recipes.json`, `supplier.json`). Required `DESIGN.md` and `Kitchen_Planner_Learner_Brief.md` are missing, so this step is not complete.
- [x] App scaffold runs. Evidence: Started with `npm start` using Node.js v24.22.1. `node --check server.js` passed; local homepage returned HTTP 200 and contained “Weekly kitchen plan”; `/api/plan` returned 15 eligible orders, 1 excluded order, 5,280 units and stock packs of 20 bread, 2 cheese, 0 egg and 2 chicken.
- [ ] Stock, HR and CRM imports validate, save to Postgres and survive reload. Evidence: Added upload validation and PostgreSQL upsert/read code. The five supplied sample file types passed validation (stock 4, staff 7, leave 2, availability 6, CRM 16), and an invalid CRM upload returned HTTP 400. No PostgreSQL save/reload was verified because `DATABASE_URL` is blank.
- [ ] Verified calculations match the supplied rules. Evidence: Independent CSV/JSON arithmetic check passed for cutoff, total units, labour and stock packs. Full roster/business-rule verification awaits the missing learner brief.
- [ ] Run planning agents calls OpenAI and shows three recommendations and a handoff trace. Evidence: The local **Test OpenAI** button uses the server-side Responses API and `OPENAI_API_KEY`. Syntax, key-not-in-page and missing-key checks passed; after the key was configured, the live API returned “OpenAI connection successful.” Full three-agent planning and handoff trace remain to be implemented.
- [ ] Dashboard shows next-week plan, exceptions and action list. Evidence:
- [ ] GitHub repository and Vercel frontend/backend work. URL and evidence: Local commit `2cac733` contains source plus only three approved reference JSON files. `.env`, `operating data/`, `node_modules/` and `.DS_Store` are ignored. GitHub push and Vercel deployment have not occurred.
- [ ] Gmail draft appears unsent in my connected Gmail. Evidence:

Next step:
Complete stock, HR and CRM import validation with PostgreSQL persistence, then verify data survives a reload. A PostgreSQL connection is not configured yet. `DESIGN.md` and `Kitchen_Planner_Learner_Brief.md` are also missing; `Kitchen_Planner_Design.md` supplies the available design guidance.
Blocker, if any: `DATABASE_URL` is currently blank; a hosted PostgreSQL database must be connected before upload/reload can be verified. The user approved publishing the project code, documents and three reference JSON files to public `junxiong1982/kitchenhelper`. Do not mark imports or deployment complete until a working hosted database and live reload are verified.
