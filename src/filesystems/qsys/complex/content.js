let IBMi = require(`../../../api/IBMi`);
let instance = require(`../../../Instance`);

const util = require(`util`);
const fs = require(`fs`);
const tmp = require(`tmp`);

const tmpFile = util.promisify(tmp.file);
const writeFileAsync = util.promisify(fs.writeFile);

let allSourceDates = require(`./sourceDates`);

module.exports = class IBMiContent {
  /**
   * Download the contents of a source member using SQL.
   * This option also stores the source dates internally.
   * @param {string|undefined} asp
   * @param {string} lib 
   * @param {string} spf 
   * @param {string} mbr 
   */
  static async downloadMemberContentWithDates(asp, lib, spf, mbr) {
    const connection = instance.getConnection();
    const content = instance.getContent();
    const db2 = connection.remoteFeatures.db2util;

    lib = lib.toUpperCase();
    spf = spf.toUpperCase();
    mbr = mbr.toUpperCase();

    if (db2) {
      const tempLib = connection.config.tempLibrary;
      const alias = `${lib}_${spf}_${mbr.replace(/\./g, `_`)}`;
      const aliasPath = `${tempLib}.${alias}`;
  
      try {
        await content.runSQL(`CREATE ALIAS ${aliasPath} for ${lib}.${spf}("${mbr}")`);
      } catch (e) {}
  
      let rows = await content.runSQL(
        `select srcdat, REPLACE(rtrim(srcdta), ' ', '.+') as srcdta from ${aliasPath}`,
      );

      if (rows.length === 0) {
        rows.push({
          SRCDAT: 0,
          SRCDTA: ``,
        });
      }
  
      const sourceDates = rows.map(row => String(row.SRCDAT).padStart(6, `0`));
      const body = rows
        .map(row => row.SRCDTA.replace(/\.\+/g, ` `))
        .join(`\n`);

      allSourceDates[alias] = sourceDates;

      return body;

    } else {
      throw new Error(`db2util not installed on remote server.`);
    }
  }

  /**
   * Upload to a member with source dates 
   * @param {string|undefined} asp 
   * @param {string} lib 
   * @param {string} spf 
   * @param {string} mbr 
   * @param {string} body 
   */
  static async uploadMemberContentWithDates(asp, lib, spf, mbr, body) {
    const connection = instance.getConnection();
    const db2 = connection.remoteFeatures.db2util;
    const setccsid = connection.remoteFeatures.setccsid;

    if (db2) {
      const tempLib = connection.config.tempLibrary;
      const alias = `${lib}_${spf}_${mbr.replace(/\./g, `_`)}`;
      const aliasPath = `${tempLib}.${alias}`;
      const sourceDates = allSourceDates[alias];

      const client = connection.client;
      const tempRmt = connection.getTempRemote(lib + spf + mbr);
      const tmpobj = await tmpFile();

      const sourceData = body.split(`\n`);

      let rows = [],
        sequence = 0;
      for (let i = 0; i < sourceData.length; i++) {
        sequence = i + 1;
        rows.push(
          `(${sequence}, ${Number(sourceDates[i])}, '${this.escapeString(sourceData[i])}')`,
        );
      }

      //We assume the alias still exists....
      const query = `insert into ${aliasPath} values ${rows.join(`,`)};`;

      await writeFileAsync(tmpobj, query, `utf8`);
      await client.putFile(tmpobj, tempRmt);

      await connection.remoteCommand(`CLRPFM FILE(${lib}/${spf}) MBR(${mbr})`);
      if (setccsid) await connection.paseCommand(`${setccsid} 1208 ${tempRmt}`);
      await connection.remoteCommand(
        `QSYS/RUNSQLSTM SRCSTMF('${tempRmt}') COMMIT(*NONE) NAMING(*SQL)`,
      );
  
    } else {
      throw new Error(`db2util not installed on remote server.`);
    }
  }

  /**
   * 
   * @param {string} val 
   * @returns {string}
   */
  static escapeString(val) {
    val = val.replace(/[\0\n\r\b\t'\x1a]/g, function (s) {
      switch (s) {
      case `\0`:
        return `\\0`;
      case `\n`:
        return `\\n`;
      case `\r`:
        return `\\r`;
      case `\b`:
        return `\\b`;
      case `\t`:
        return `\\t`;
      case `\x1a`:
        return `\\Z`;
      case `'`:
        return `''`;
      default:
        return `\\` + s;
      }
    });
  
    return val;
  }
}
