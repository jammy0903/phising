
# 🛡️ Anti-Phishing Chrome Extension

A Chrome extension designed to protect users from phishing websites. Through real-time URL analysis powered by Heuristic-based approach, it detects malicious websites and alerts users to potential threats.

## ✨ Key Features

- Real-time URL analysis and phishing site detection
- Heuristic-based intelligent detection system
- Pattern matching for suspicious URL structures
- User-friendly warning notifications
- Automatic background operation

```markdown
## 🔧 Tech Stack

- TypeScript
- JavaScript
- HTML/CSS/SCSS
- Chrome Extension API
- Machine Learning Model (for URL analysis)

## 📥 Installation Guide
### ⚠️ DO NOT USE - Work in Progress
1. Clone the project
```bash
git clone https://github.com/jammy0903/phising.git
cd phising
```

2. Install dependencies
```bash
npm install
```

3. Build
```bash
npm run build
```

4. Install Chrome Extension
- Go to `chrome://extensions` in Chrome browser
- Enable "Developer mode" in the top right
- Click "Load unpacked extension"
- Select the built project directory
```
## 💻 How to Use
### ⚠️ DO NOT USE - Work in Progress
1. The extension runs automatically after installation in Chrome browser.
2. Warning alerts will automatically appear when visiting suspicious phishing sites while web browsing.
3. Click the extension icon to access additional settings and check status.

## 🔍 How It Works

1. **URL Collection**: Real-time collection of URLs from websites visited by users
2. **Feature Extraction**: Extract the following features from URLs
- Domain length
- Special character usage
- SSL certificate status
- URL structure analysis
3. **Result Processing**: Display warning messages to users when risks are detected

## ⚠️ Precautions

- This extension is an additional security measure and cannot replace basic security practices.
- False positives may occur, so please carefully evaluate when warning messages appear.
- Regular updates are provided to respond to the latest security threats

## 📚 ref
- [Chrome Extension ](https://developer.chrome.com/docs/extensions/)
