# Kitchen Planner progress

Mark an item done only after checking it. Add one short evidence note with a test result, screen, saved database record or live URL.

- [ ] Three project files created and reviewed. Evidence: Reviewed `Kitchen_Planner_Design.md` and the three seed JSON files in `operating data/` (`scenario.json`, `products_and_recipes.json`, `supplier.json`). Required `DESIGN.md` and `Kitchen_Planner_Learner_Brief.md` are missing, so this step is not complete.
- [x] App scaffold runs. Evidence: Started with `npm start` using Node.js v24.22.1. `node --check server.js` passed; local homepage returned HTTP 200 and contained “Weekly kitchen plan”; `/api/plan` returned 15 eligible orders, 1 excluded order, 5,280 units and stock packs of 20 bread, 2 cheese, 0 egg and 2 chicken.
- [x] Stock, HR and CRM imports validate, save to Postgres and survive reload. Evidence: The five supplied sample file types passed validation (stock 4, staff 7, leave 2, availability 6, CRM 16), and invalid CRM returned HTTP 400. Neon Free saved all five approved files through the protected production `/api/import`; fresh `/api/plan` and homepage requests showed all five imports, 15 eligible orders, 1 late order and 5,280 units. A duplicate synthetic CRM export counted once and was removed.
- [ ] Verified calculations match the supplied rules. Evidence: Independent CSV/JSON arithmetic check passed for cutoff, total units, labour and stock packs. Full roster/business-rule verification awaits the missing learner brief.
- [ ] Run planning agents calls OpenAI and shows three recommendations and a handoff trace. Evidence: The local **Test OpenAI** button uses the server-side Responses API and `OPENAI_API_KEY`. Syntax, key-not-in-page and missing-key checks passed; after the key was configured, the live API returned “OpenAI connection successful.” Full three-agent planning and handoff trace remain to be implemented.
- [ ] Dashboard shows next-week plan, exceptions and action list. Evidence:
- [x] GitHub repository and Vercel frontend/backend work. URL and evidence: `https://github.com/junxiong1982/kitchenhelper` deploys to `https://kitchenhelper-david-ng.vercel.app`. Vercel production build was Ready with four serverless functions. Protected live homepage, `/api/plan`, `/api/import` and `/api/openai-test` worked; saved data survived fresh requests. Clean build contained zero private operating files and exactly three approved reference JSON files. Neon Free, APP_PASSWORD and OPENAI_API_KEY are server-side settings.
- [ ] Gmail draft appears unsent in my connected Gmail. Evidence:

Next step:
Obtain `DESIGN.md` and `Kitchen_Planner_Learner_Brief.md` or reconcile their missing rules against `Kitchen_Planner_Design.md`; then verify deterministic roster and purchasing rules before building the three planning agents and action list.
Blocker, if any: The named design and learner brief files are still missing. The deployed app currently has an OpenAI connection test but not the three-agent planning workflow, Gmail draft action or completed action dashboard.
