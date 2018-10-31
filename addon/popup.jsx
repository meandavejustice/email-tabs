/* globals React, ReactDOM, ReactDOMServer, templateMetadata */
/* eslint jsx-a11y/click-events-have-key-events: 0 */
/* eslint jsx-a11y/no-noninteractive-element-interactions: 0 */

let activeTabLi;
let activeTabSelected = false;
let selected = new Map();
let mailProvider;
let isSelectingMailProvider = false;
const LOGIN_ERROR_TIME = 90 * 1000; // 90 seconds

/* True if this is a tab we can "send". Doesn't include about:preferences, etc. */
function isSelectableTabUrl(url) {
  return url.startsWith("http");
}

class Tab extends React.Component {
  render() {
    let tab = this.props.tab;
    let checkId = `checkbox-${this.props.tab.id}`;
    let checked = this.props.selected.get(tab.id);
    let liClass;
    if (tab.active) {
      liClass = "active";
    }
    let image = <span className="tab__image" style={{backgroundImage: `url(${tab.favIconUrl})`}} />;
    return <li className={liClass} ref={li => {
      if (this.props.tab.active) {
        activeTabLi = li;
      }
    }}>
      <div className={isSelectableTabUrl(tab.url) ? "tab" : "tab disabled"}>
        <label htmlFor={checkId}>
          { isSelectableTabUrl(tab.url) ? <input type="checkbox" value={tab.id} checked={checked}
            onChange={this.onChange.bind(this)} id={checkId} ref={checkbox => this.checkbox = checkbox} /> : <input type="checkbox" disabled /> }
          <label htmlFor={checkId} className="styled-checkbox"></label>
          <label htmlFor={checkId} className="tab__label">
            { image }
            <span className="tab__text">{tab.title}</span>
          </label>
        </label>
      </div>
    </li>;
  }

  async onFeedback() {
    browser.runtime.sendMessage({
      type: "sendEvent",
      ec: "interface",
      ea: "button-click",
      el: "feedback",
      cd1: await browser.tabs.query({currentWindow: true}).length,
      cd2: getSelectedCount(),
      cd3: activeTabSelected,
      cd7: mailProvider,
    });
  }

  onChange() {
    selected.set(this.props.tab.id, this.checkbox.checked);
    if (this.props.onChange) {
      this.props.onChange();
    }
    render();
  }
}



function getSelectedCount() {
  return Array.from(selected.values()).filter(x => x).length;
}

class TabList extends React.Component {
  render() {
    let tabElements = this.props.tabs.map(
      tab => <Tab tab={tab} key={tab.id} selected={this.props.selected} onChange={this.onChangeSelection.bind(this)} />
    );
    return <div className="tabs-wrapper">
      <section className="tabs-section" style={{display: "flex"}}>
        <ul className="tabs-section__list" role="navigation">{tabElements}</ul>
      </section>
    </div>;
  }
  onChangeSelection() {
    selectionCache.saveSelectedTabs(this.props.tabs);
  }
}

class Popup extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      showLoginError: this.props.showLoginError,
    };
  }

  dismissError() {
    this.setState({showLoginError: false});
  }

  render() {
    let anyChecked = false;
    let allChecked = true;
    this.indeterminate = false;
    const linkableTabs = this.props.tabs.filter((t) => isSelectableTabUrl(t.url));
    for (let tab of linkableTabs) {
      if (!this.props.selected.get(tab.id)) {
        allChecked = false;
      } else {
        anyChecked = true;
        this.indeterminate = true;
      }
    }
    if (allChecked) {
      this.indeterminate = false;
    }

    let emailTabsTitle = null;
    if (this.props.incognito) {
      emailTabsTitle = "Emailing tabs from a Private Browsing window is not supported";
    }
    return <div>
      { this.state.showLoginError ? <LoginError dismissError={this.dismissError.bind(this)} /> : null }
      <div className="controls">
        <div>
          <input checked={allChecked} ref={allCheckbox => this.allCheckbox = allCheckbox} type="checkbox" id="allCheckbox" onChange={this.onClickCheckAll.bind(this)} />
          <label htmlFor="allCheckbox" className="styled-checkbox"></label>
          <label htmlFor="allCheckbox">Select All</label>
          <button onClick={this.onSelectProvider.bind(this)}>Settings</button>
        </div>
      </div>
      <div className="separator"></div>
      <div className="tabList">
        <TabList tabs={this.props.tabs} selected={this.props.selected} />
      </div>
      <div className="separator"></div>
      <p className="feedback-link">What do you think of Email Tabs? <a href="mailto:team-email-tabs@mozilla.com" onClick={this.onFeedback}>Let us know.</a></p>

      <footer className="panel-footer toggle-enabled">
        <button onClick={this.copyTabs.bind(this)} disabled={!anyChecked}>
          Copy Tabs to Clipboard
        </button>
        <button onClick={this.sendEmail.bind(this)} disabled={!anyChecked || this.props.incognito} title={emailTabsTitle} >
          Email Tabs
        </button>
      </footer>

    </div>;
  }

  componentDidMount() {
    this.allCheckbox.indeterminate = this.indeterminate;
  }

  componentDidUpdate() {
    this.componentDidMount();
  }

  async onClickCheckAll() {
    let allChecked = true;
    let selectableTabs = this.props.tabs.filter(tab => isSelectableTabUrl(tab.url));
    for (let tab of selectableTabs) {
      allChecked = allChecked && this.props.selected.get(tab.id);
    }
    for (let tab of selectableTabs) {
      selected.set(tab.id, !allChecked);
    }
    selectionCache.clear();
    render();

    await browser.runtime.sendMessage({
      type: "sendEvent",
      ec: "interface",
      ea: "select-all",
      el: "browser-action",
      cd1: await browser.tabs.query({currentWindow: true}).length,
      cd7: mailProvider,
    });
  }

  async sendEmail() {
    let sendTabs = this.props.tabs.filter(tab => this.props.selected.get(tab.id));
    if (!sendTabs.length) {
      console.info("Tried to send tabs with nothing selected");
      return;
    }
    localStorage.removeItem("loginInterrupt");
    sendTabs = sendTabs.map(tab => tab.id);

    await browser.runtime.sendMessage({
      type: "sendEmail",
      mailProvider,
      tabIds: sendTabs,
      customDimensions: {
        cd1: await browser.tabs.query({currentWindow: true}).length,
        cd2: getSelectedCount(),
        cd3: activeTabSelected,
        cd6: this.allCheckbox.checked,
        cd7: mailProvider,
      },
    });

    browser.runtime.sendMessage({
      type: "sendEvent",
      ec: "interface",
      ea: "button-click",
      el: "email-tabs",
      cd1: await browser.tabs.query({currentWindow: true}).length,
      cd2: getSelectedCount(),
      cd3: activeTabSelected,
      cd6: this.allCheckbox.checked,
      cd7: mailProvider,
    });

    window.close();
  }

  async copyTabs() {
    let sendTabs = this.props.tabs.filter(tab => this.props.selected.get(tab.id));
    if (!sendTabs.length) {
      console.info("Tried to copy tabs with nothing selected");
      return;
    }
    sendTabs = sendTabs.map(tab => tab.id);
    await browser.runtime.sendMessage({
      type: "copyTabHtml",
      tabIds: sendTabs,
    });
    setTimeout(() => {
      window.close();
    }, 300);

    browser.runtime.sendMessage({
      type: "sendEvent",
      ec: "interface",
      ea: "button-click",
      el: "copy-tabs-to-clipboard",
      cd1: await browser.tabs.query({currentWindow: true}).length,
      cd2: getSelectedCount(),
      cd3: activeTabSelected,
      cd7: mailProvider,
    });
  }

  async onSelectProvider() {
    isSelectingMailProvider = true;
    render();
  }

}

class LoginError extends React.Component {
  render() {
    return <div id="login-error">
      <img className="warn" src="images/warning.svg" alt="warning icon"/>
      <p>Don&#39;t forget to sign in to your email account to use Email Tabs.</p>
      <img className="close" src="images/close.svg" onClick={this.props.dismissError} alt="close" />
    </div>;
  }
}

class MailPreference extends React.Component {
  render() {
    let footer = (
      <footer className="panel-footer toggle-enabled">
        <button onClick={this.onCancel.bind(this)}>
          Cancel
        </button>
      </footer>
    );

    return <div>
      <div>
        <button onClick={this.onSelect.bind(this, "gmail")}>Gmail</button>
        <button onClick={this.onSelect.bind(this, "yahoo")}>Yahoo</button>
        <button onClick={this.onSelect.bind(this, "outlook")}>Outlook</button>
      </div>
      <div className="separator"></div>
      {this.props.mailProvider ? footer : null}
    </div>;
  }

  async onSelect(provider) {
    let previousMailProvider = mailProvider;
    mailProvider = provider;
    browser.storage.local.set({mailProvider});
    isSelectingMailProvider = false;
    await browser.runtime.sendMessage({
      type: "sendEvent",
      ec: "interface",
      ea: "provider-select",
      el: provider,
      cd1: await browser.tabs.query({currentWindow: true}).length,
      cd7: previousMailProvider,
    });
    render();
  }

  async onLearnMore() {
    await browser.runtime.sendMessage({
      type: "sendEvent",
      ec: "interface",
      ea: "provider-learn-more",
      cd1: await browser.tabs.query({currentWindow: true}).length,
      cd7: mailProvider,
    });
  }

  async onCancel() {
    isSelectingMailProvider = false;
    await browser.runtime.sendMessage({
      type: "sendEvent",
      ec: "interface",
      ea: "provider-cancel",
      cd1: await browser.tabs.query({currentWindow: true}).length,
      cd7: mailProvider,
    });
    render();
  }
}

async function render(firstRun) {
  let tabs = await browser.tabs.query({currentWindow: true});
  let incognito = tabs.some(tab => tab.incognito);
  if (firstRun) {
    if (!selectionCache.loadSelectedTabs(tabs)) {
      for (let tab of tabs) {
        if (tab.active && isSelectableTabUrl(tab.url)) {
          activeTabSelected = true;
          selected.set(tab.id, true);
        }
      }
    }
  }
  let showLoginError = parseInt(localStorage.getItem("loginInterrupt") || "0", 10);
  if (Date.now() - showLoginError > LOGIN_ERROR_TIME) {
    showLoginError = false;
  }
  let page;
  if (mailProvider && !isSelectingMailProvider) {
    page = <Popup selected={selected} tabs={tabs} showLoginError={showLoginError} incognito={incognito} />;
  } else {
    await browser.runtime.sendMessage({
      type: "sendEvent",
      ec: "interface",
      ea: "provider-preference",
      el: isSelectingMailProvider ? "settings" : "first-time",
      cd1: await browser.tabs.query({currentWindow: true}).length,
      cd7: mailProvider,
    });
    page = <MailPreference mailProvider={mailProvider} />;
  }
  ReactDOM.render(page, document.getElementById("panel"));
  if (firstRun) {
    activeTabLi.scrollIntoView({
      behavior: "instant",
      block: "center",
    });
  }
}

const selectionCache = {
  timeout: 30 * 60 * 1000, // 30 minutes

  key: "selectionCache",

  load() {
    let value = localStorage.getItem(this.key);
    if (!value) {
      return null;
    }
    value = JSON.parse(value);
    if (Date.now() - value.time > this.timeout) {
      localStorage.removeItem(this.key);
      return null;
    }
    return value.cache;
  },

  loadSelectedTabs(tabs) {
    let value = this.load();
    if (!value) {
      return false;
    }
    let anyFound = false;
    for (let tab of tabs) {
      if (value[tab.id] && value[tab.id].url === tab.url) {
        anyFound = true;
        selected.set(tab.id, true);
      }
    }
    return anyFound;
  },

  save(value) {
    localStorage.setItem(this.key, JSON.stringify({
      cache: value,
      time: Date.now(),
    }));
  },

  saveSelectedTabs(tabs) {
    let newValue = {};
    for (let tab of tabs) {
      if (selected.get(tab.id)) {
        newValue[tab.id] = {url: tab.url};
      }
    }
    this.save(newValue);
  },

  clear() {
    localStorage.removeItem(this.key);
  },
};

/** Calls render(), then calls it again soon */
function renderWithDelay() {
  render();
  setTimeout(render, 300);
}

for (let eventName of ["onAttached", "onCreated", "onDetached", "onMoved", "onUpdated"]) {
  browser.tabs[eventName].addListener(render);
}

browser.tabs.onRemoved.addListener(renderWithDelay);

async function init() {
  let result = await browser.storage.local.get("mailProvider");
  mailProvider = result.mailProvider;
  render(true);
  browser.runtime.sendMessage({
    type: "sendEvent",
    ec: "interface",
    ea: "expand-panel",
    el: "browser-action",
    cd1: await browser.tabs.query({currentWindow: true}).length,
    cd7: mailProvider,
  });
}

init();
