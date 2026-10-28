# Kitchen Planner (local preview)

This small local preview shows the sample week plan from the files in `operating data/`.

## Private settings

The project has a private `.env` file with a blank `OPENAI_API_KEY` setting. To test OpenAI locally, open `.env`, paste your key after `OPENAI_API_KEY=`, and save. Keep real keys only in `.env`; it is excluded by `.gitignore`. Do not paste keys into chat or put them in this README. `.env.example` is a blank template and is safe to share. Restart the server after changing `.env`, then click **Test OpenAI** on the dashboard.

The **Test OpenAI** button sends one short request to the OpenAI Responses API using `gpt-6-luna`. The full three-agent planner is not implemented yet. The upload forms validate stock, HR and CRM files and save accepted exports to PostgreSQL when `DATABASE_URL` points to a working database. Gmail/Zapier actions are not connected. Gmail/Zapier access must be connected through an approved integration when that feature is built.

The Vercel deployment uses HTTP Basic authentication. Its private password is stored in `.planner-password` on this Mac and as `APP_PASSWORD` in Vercel. Use any username when prompted and the value from that private file as the password. Keep `.planner-password` private; it is excluded from Git and deployment files.

Hosted app: <https://kitchenhelper-david-ng.vercel.app>. Vercel may first ask you to sign in to your Vercel account; then the app asks for the password described above.

## Start it

1. Install Node.js 18 or newer if it is not already installed.
2. Open Terminal in this folder.
3. Run `npm start`.
4. Open <http://127.0.0.1:4173> in your browser.

The preview calculates the order cutoff, daily production, ingredient demand and stock packs each time the page loads. Without saved imports, the local server uses the private sample files. The deployed app requires saved imports and never bundles the private `operating data/` folder. It does not book staff or send email.
