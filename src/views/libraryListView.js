
const vscode = require(`vscode`);

let instance = require(`../Instance`);
const Configuration = require(`../api/Configuration`);

const profileProps = [`currentLibrary`, `homeDirectory`, `libraryList`, `sourceFileList`, `objectBrowserList`, `databaseBrowserList`, `ifsShortcuts`];

module.exports = class memberBrowserProvider {
  /**
   * @param {vscode.ExtensionContext} context
   */
  constructor(context) {
    this.selections = undefined;
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.emitter.event;

    // used for targeted member list refreshes
    this.targetLib = `*ALL`;
    this.targetSpf = `*ALL`;
    this.refreshCache = {}; // cache entries of format 'LIB/SPF': members[]

    context.subscriptions.push(
      vscode.commands.registerCommand(`code-for-ibmi.refreshLibraryListView`, async () => {
        this.refresh();
      }),

      vscode.commands.registerCommand(`code-for-ibmi.addToLibraryList`, async () => {
        const config = instance.getConfig();

        let libraryList = config.libraryList;

        const addingLib = await vscode.window.showInputBox({
          prompt: `Library to add`
        });

        if (addingLib) {
          if (addingLib.length <= 10) {
            libraryList.push(addingLib.toUpperCase());
            await config.set(`libraryList`, libraryList);
            if (Configuration.get(`autoRefresh`)) this.refresh();
          } else {
            vscode.window.showErrorMessage(`Library is too long.`);
          }
        }
      }),

      vscode.commands.registerCommand(`code-for-ibmi.removeFromLibraryList`, async (node) => {
        if (node) {
          //Running from right click
          const config = instance.getConfig();

          let libraryList = config.libraryList;

          let index = libraryList.findIndex(file => file.toUpperCase() === node.path)
          if (index >= 0) {
            libraryList.splice(index, 1);

            await config.set(`libraryList`, libraryList);
            if (Configuration.get(`autoRefresh`)) this.refresh();
          }
        }
      }),

      vscode.commands.registerCommand(`code-for-ibmi.moveLibraryUp`, async (node) => {
        if (node) {
          //Running from right click
          const config = instance.getConfig();

          let libraryList = config.libraryList;

          let index = libraryList.findIndex(file => file.toUpperCase() === node.path);
          if (index >= 0 && (index - 1) >= 0) {
            const library = libraryList[index];
            libraryList.splice(index, 1);
            libraryList.splice(index-1, 0, library);

            await config.set(`libraryList`, libraryList);
            if (Configuration.get(`autoRefresh`)) this.refresh();
          }

        }
      }),

      vscode.commands.registerCommand(`code-for-ibmi.moveLibraryDown`, async (node) => {
        if (node) {
          //Running from right click
          const config = instance.getConfig();

          let libraryList = config.libraryList;

          let index = libraryList.findIndex(file => file.toUpperCase() === node.path);
          if (index >= 0 && (index + 1) >= 0) {
            const library = libraryList[index];
            libraryList.splice(index, 1);
            libraryList.splice(index+1, 0, library);

            await config.set(`libraryList`, libraryList);
            if (Configuration.get(`autoRefresh`)) this.refresh();
          }

        }
      }),

      vscode.commands.registerCommand(`code-for-ibmi.saveConnectionProfile`, async () => {
        const config = instance.getConfig();

        let currentProfiles = config.connectionProfiles;

        const profileName = await vscode.window.showInputBox({
          prompt: `Name of library list profile`
        });

        if (profileName) {
          const existingIndex = currentProfiles.findIndex(profile => profile.name.toUpperCase() === profileName.toUpperCase());

          if (existingIndex >= 0) {
            for (const prop of profileProps) {
              currentProfiles[existingIndex][prop] = config[prop];
            }
          } else {
            let newProfile = {
              name: profileName,
            };

            for (const prop of profileProps) {
              newProfile[prop] = config[prop];
            }

            //@ts-ignore - no way because newProfile is built dynamically
            currentProfiles.push(newProfile);
          }

          await config.set(`connectionProfiles`, currentProfiles);
        }
      }),

      vscode.commands.registerCommand(`code-for-ibmi.loadConnectionProfile`, async () => {
        const config = instance.getConfig();

        const currentProfiles = config.connectionProfiles;
        const availableProfiles = currentProfiles.map(profile => profile.name);

        if (availableProfiles.length > 0) {
          const chosenProfile = await vscode.window.showQuickPick(availableProfiles);

          if (chosenProfile) {
            let profile = currentProfiles.find(profile => profile.name === chosenProfile);

            if (profile) {
              profile = {...profile}; //We clone it.
              delete profile.name;
              
              await config.setMany(profile);
              
              await Promise.all([
                vscode.commands.executeCommand(`code-for-ibmi.refreshLibraryListView`),
                vscode.commands.executeCommand(`code-for-ibmi.refreshMemberBrowser`),
                vscode.commands.executeCommand(`code-for-ibmi.refreshIFSBrowser`),
                vscode.commands.executeCommand(`code-for-ibmi.refreshObjectList`),
                vscode.commands.executeCommand(`code-for-ibmi.refreshDatabaseBrowser`)
              ]);
            }
          }

        } else {
          vscode.window.showInformationMessage(`No profiles exist for this system.`);
        }
      })
    )
  }

  refresh() {
    this.emitter.fire();
  }

  /**
   * @param {vscode.TreeItem} element
   * @returns {vscode.TreeItem};
   */
  getTreeItem(element) {
    return element;
  }

  /**
   * @returns {Promise<vscode.TreeItem[]>};
   */
  async getChildren() {
    const connection = instance.getConnection();
    const config = instance.getConfig();
    let items = [];

    if (connection) {
      const libraryList = config.libraryList;

      for (let library of libraryList) {
        library = library.toUpperCase();
        items.push(new Library(library));
      }
    }

    return items;
  }
}

class Library extends vscode.TreeItem {
  /**
   * @param {string} library
   */
  constructor(library) {
    super(library.toUpperCase(), vscode.TreeItemCollapsibleState.None);

    this.contextValue = `library`;
    this.path = library;
  }
}