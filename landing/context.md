# Context

## 2026-04-11T12:12:00+07:00
- **Task Summary**: Update Aegis Landing Page Hero Section with dual onboarding CTA cards and new messaging, emphasizing the community-driven intent-based wallet.
- **Files Modified**: `src/sections/Hero.tsx`, `index.html`
- **Commands Executed**: 
  - `source ~/.zshrc && npm run build`
- **Tests Run and Results**: Ran `tsc -b && vite build` which acts as static type and structural validation. Build completed successfully in 92ms with no TS errors or CSS issues.
- **Known Risks, Assumptions, or Limitations**: Assumed the placeholder `#` link for the Chrome extension and used a generic greyed-out icon. Visual styling assumes Tailwind CSS remains intact and relies directly on the `<style>` tags/Tailwind utilities in the app. Full visual confirmation across mobile breakpoints should be verified in a real browser.
