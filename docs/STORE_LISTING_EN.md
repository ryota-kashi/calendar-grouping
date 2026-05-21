# Chrome Web Store Listing Data (English)

This file contains the text metadata required for publishing the extension on the Chrome Web Store, formatted for easy copying and pasting.

---

## 1. Store Metadata

### Extension Name
```text
Calendar Grouping
```

### Summary
*Limit: 132 characters*
```text
Toggle Google Calendar groups with one click. Shows only selected calendars when active, and restores original view when inactive.
```

### Detailed Description
*Limit: 16,000 characters*
```text
A Chrome extension that lets you organize multiple Google Calendars into groups and switch between them with a single click.

【Recommended for】
- Managing and viewing team members' calendars together.
- Switching calendar combinations for different projects.
- Filtering calendars based on scenarios like hiring, sales, or development.

【Key Features】
✅ Group Management
Organize your calendars into groups. Create, edit, and delete groups easily.

✅ Smart Toggle (ON/OFF)
When you turn a group ON, all calendars outside the group are hidden. When you turn it OFF, your previous calendar visibility state is fully restored.

✅ Sidebar Integration
A "Calendar Groups" section is seamlessly integrated into Google Calendar's sidebar, allowing you to toggle groups without leaving the page.

✅ Lightweight & Fast
Zero background polling (no setInterval used), ensuring zero performance impact on your browser. Calendar state transitions are applied instantly.

✅ Auto-Launch
Even if Google Calendar is closed, clicking the extension icon automatically searches for or opens Google Calendar in a new tab.

【Privacy】
All calendar groups and settings are stored locally in your browser storage. No data is sent to external servers.
```

### Category
```text
Productivity
```

---

## 2. Justification for Permissions
*Use these explanations for the developer console when submitting the extension for review.*

### Permission Justifications

| Permission | Justification (English) |
|--------------|-------------------------|
| `storage` | Required to securely store calendar group configurations, selection states, and temporary calendar list caches locally within the user's browser. |
| `tabs` | Required to search for active Google Calendar tabs and automatically open a new one if it is not currently open when the extension icon is clicked. |
| `host_permissions: https://calendar.google.com/*` | Required to inject and integrate the "Calendar Groups" sidebar UI onto the Google Calendar website and safely execute scripts that toggle calendar visibility. |

---

## 3. Screenshot Plan (1280×800 recommended)

| # | Caption (Image Overlay Text) | Capturing Steps / Target State |
| :---: | :--- | :--- |
| 1 | Toggle Calendars with One Click | Full Google Calendar screen showing the integrated sidebar with groups. |
| 2 | Intuitive Group Management | The popup UI that opens when clicking the extension icon (creation/edit mode). |
| 3 | Filter Instantly (Group ON) | Google Calendar state with a specific group enabled, displaying only relevant calendars. |
| 4 | Restore Original View (Group OFF) | Google Calendar state after turning the group OFF, showing all previous calendars restored. |
| 5 | Seamless Multi-Group Management | Multiple custom groups listed and organized in the Google Calendar sidebar. |
