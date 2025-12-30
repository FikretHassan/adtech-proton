/**
 * Lifecycle Hooks Configuration
 * Copy this file to hooks.js.
 *
 * Hooks are organized by "concern" - each concern file in config/hooks/
 * registers hooks at whichever lifecycle points it needs. This allows
 * related functionality to be grouped together.
 *
 * To add hooks:
 * 1. Create a concern file in config/hooks/ (see example.scaffold.js)
 * 2. Import it in config/hooks/index.js
 * 3. Add it to the concerns array
 *
 * Example concerns:
 * - analytics.js - impression tracking, viewability
 * - customTargeting.js - setting targeting before ad requests
 * - debugging.js - console logging at various points
 */

import hooks from './hooks/index.js';

export default hooks;

/*
 * Available Hook Points:
 *
 * INIT PHASE
 * - loader.beforeInit      - Before loader initialization
 * - loader.afterInit       - After loader initialization
 *
 * PLUGINS PHASE
 * - plugin.beforeLoad      - Before a plugin loads
 * - plugin.afterLoad       - After a plugin loads
 * - plugin.onError         - When a plugin fails to load
 *
 * PARTNERS PHASE
 * - partners.beforeReady   - Before partner readiness check
 * - partners.afterReady    - After blocking partners ready (key hook for targeting)
 * - partners.onTimeout     - When partners timeout
 *
 * SLOTS PHASE
 * - slot.beforeDefine      - Before GPT slot definition
 * - slot.afterDefine       - After GPT slot defined
 *
 * ADS REQUEST PHASE
 * - ads.beforeRequest      - Before batch ad request
 * - slot.beforeRequest     - Before individual slot request
 * - slot.afterRequest      - After individual slot request
 * - ads.afterRequest       - After batch ad request
 *
 * RENDER PHASE
 * - slot.beforeRender      - Before slot renders
 * - slot.afterRender       - After slot renders (key hook for tracking)
 * - slot.onEmpty           - When slot has no fill
 *
 * REFRESH PHASE
 * - slot.beforeRefresh     - Before slot refresh
 * - slot.afterRefresh      - After slot refresh
 *
 * INJECTION PHASE
 * - injection.beforeInject - Before dynamic ad injection
 * - injection.afterInject  - After dynamic ad injection
 *
 * PAGE PHASE
 * - page.beforeUnload      - Before page unload
 * - page.visibilityChange  - When page visibility changes
 */
