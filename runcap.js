/**
 * A simple facade to 'ionic cap' command that first copies the app specific
 * capacitor config file into capacitor.config.ts and then spawns the
 * 'ionic cap' with the arguments provided to this command.
 * 
 * This command relies on the --project parameter to deduce the app's name,
 * and therefore this parameter is required.
 * 
 * The app specific capacitor config files are to be named as:
 * 
 *  capacitor-<project>.config.ts.
 * 
 * Since capacitor.config.ts is transient, it's added to .gitignore.
 */
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { spawn } = require('child_process');
const fs = require('fs');

const capacitorConfig = `
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  android: {
    path: './apps/<project>/android'
  }
};

export default config;
`;

const args = yargs(hideBin(process.argv))
  .option('project', {
    type: 'string',
    description: 'Capacitor app to execute commands on.'
  })
  .demandOption("project")
  .argv

const CAPACITOR_CONFIG_FILE = 'capacitor.config.ts';

// Create the bare capacitor.config.ts for the given project
fs.writeFileSync(
  CAPACITOR_CONFIG_FILE,
  capacitorConfig.replace("<project>", args.project)
);

// Copy the project specific capacitor config file into 
// capacitor.config.ts.
// require('fs').copyFile(`capacitor-${args.project}.config.ts`, CAPACITOR_CONFIG_FILE, (err) => {
//   if (err) throw err;
// })

// Now run 'ionic cap <args[2:]>'
const capacitorArgs = process.argv.splice(2);
let ionicCommand = `ionic cap ${capacitorArgs.join(' ')}`;
// console.log(`ionic cmd: ${ionicCommand}`);
const child = spawn(ionicCommand, [], { shell: true, stdio: 'inherit' });

// This is optional. We can very well leave the file there.
child.on('close', (code) => {
  fs.unlinkSync(CAPACITOR_CONFIG_FILE);
});
