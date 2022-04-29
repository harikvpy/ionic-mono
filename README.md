# Ionic/Capacitor Monorepo

This is a sample repository that shows how to setup a monorepo for building multiple Ionic Angular apps with no external tools other than the standard Ionic & Angular CLIs.

# Background

My first attempt at setting up a monorepo was following the official documentation on Ionic's website. There are really two pieces that point to this -- the CLI [doc](https://ionicframework.com/docs/cli/configuration#multi-app-projects) on multi-apps and a related [Wiki](https://github.com/ionic-team/ionic-cli/wiki/Angular-Monorepo) page. Unfortunately, the two 'official' pieces of documentation are not really synced very well. Whereas the CLI doc shows the basics of running the CLI for a multi-app project, the latter uses the Angular CLI to set things up.

Overall the Wiki page looks more thorough, but it only shows the setup for a project consisting of an app and a web page. Trying to extend it support multiple apps, one will face the issue of the platform output folder for the two apps conflicting with each other.

One way to address the above is to use [NX](https://nx.dev/) to setup the project environment and manage the build. There's an NX Ionic [plugin](https://nxtend.dev/docs/ionic-angular/overview) to help with this, which works somewhat well. That is until you need to use the `--livereload` to test the fine changes to the app code on a device. Unfortunately I couldn't find a reliable way to get this working. This limitation along with the fact that the plugin has not seen much recent activity led me to this project.

# Solution
The following steps outline the process involved in setting up a monorepo for building multiple Ionic apps. The first few steps follow what's outlined in the [Wiki] (https://github.com/ionic-team/ionic-cli/wiki/Angular-Monorepo) page.

1. Create a new empty Angular workspace
   ```
   $ ng new --create-application=false --new-project-root='apps' ionic-mono
   $ cd ionic-mono
   $ ionic init --multip-app
   ```
2. Generate the app and initialize it for ionic.
   ```
   $ ng generate application --prefix=app --routing --style=sass app-one
   $ ng add @ionic/angular --project=app-one
   $ cd apps/app-one
   $ ionic init app --type=angular --default --project-id=app-one
   ```
3. Enable capacitor integrations for the app. (from workspace folder)
   ```
   $ cd ../..
   $ ionic integrations enable capacitor --project=app-one
   ```
4. By default angular is configured to write the app build output to `dist/<app_name>` folder.
   We want to change it to `dist/apps/<app_name>` so that `dist/` folder structure mimics the project folder structure. So create dist folder for the ionic build output first. After this update the project's `outputPath` in `angular.json` replacing `dist/app-one` with `dist/apps/app-one`.
   ```
   $ mkdir -p dist/apps/app-one
   ```
5. Rightfully this should be enough to build `app-one`. However, if you issue `ionic build 
   --project app-one` now, you will get the error
   ```
   Error: ENOENT: no such file or directory, open '.../apps/app-one/package.json'
   ```
   To fix this we need to add a dummy package.json in `apps/app-one` with the following contents:
   ```
   {
      "name": "appone",
      "devDependencies": {
         "@capacitor/cli": "3.5.0"
      }
   }
   ```
   Now build the project from workspace root folder with the command below: 
   ```
   $ ionic build --project app-one
   ```
6. You should see build output in `dist/apps/app-one`. You'll also notice that `node_modules` is 
   created under `apps/app-one`. This is where NPM caches the dependencies build output, ostensibly to speed future builds. Create `.gitignore` in `apps/app-one` to exclude `node_modules` from the Git repo.

7. Create `apps/app-one/capacitor.config.ts` with the following contents:
   ```
   import { CapacitorConfig } from '@capacitor/cli';

   const config: CapacitorConfig = {
   appId: 'com.smallpearl.appone',
   appName: 'Monorepo AppOne',
   webDir: '../../dist/apps/app-one',
   bundledWebRuntime: false,
   includePlugins: [
      "@capacitor/app",
      "@capacitor/camera",
      "@capacitor/core",
      "@capacitor/haptics",
      "@capacitor/keyboard",
      "@capacitor/status-bar"
   ]
   };

   export default config;
   ```
8. Create another `capacitor.config.ts` in the workspace root folder with the following contents:
   ```
   import { CapacitorConfig } from '@capacitor/cli';

   const config: CapacitorConfig = {
      android: {
         path: './apps/app-one/android'
      }
   };

   export default config;
   ```
   This is to inform `ionic cap` the location of the android app folder for the `app-one` project. Unfortunately `ionic cap` doesn't seem to obey the `--project` command parameter value when it comes to checking the presence of `platform` folder and creates it under the folder where it is invoked from. This config file will prevent this.

   For a multi-app project, constantly updating this to point to the right project that you're working on can be a pain. We can automate this via a simple script, which is described [here](#runcap).

9.  Sync & build the app
   ```
   $ ionic cap sync android --project app-one
   $ ionic cap run android --livereload --external --project app-one
   ```
   The first command will invoke `ng:build`, create the `./apps/app-one/android` folder as it doesn't exist yet and then copy the `ng:build` output to the app's assets folder.

   The second command should start Gradle to build the app and open it up on the chosen device or emulated VM.

# Need for extra capacitor config file
   With ionic project setup for multi-app, one would expect capacitor CLI to read these settings from ionic.config.json and work accordingly. However in reality things are different as `ionic cap` always looks for `./android` (if you're building an android app) folder under the workspace root and on not finding one, tries to generate the platform code for the project in that folder. Now if you have only one mobile app in you repo and the other is a web app like the example espoused in the Wiki page, all is well. But if you have two mobile apps, you will find that both send their mobile app outputs to the same folder.
   
   We need a small hack (or kludge, you be the judge) to get around this.
   
   First we create `capacitor.config.ts` for each project within its own folder. So we create `apps/app-one/capacitor.config.ts` and if you have `apps/app-two`, `apps/app-two/capacitor.config.ts`.

   Besides setting the right `webDir`, this app specific capacitor config file also lists the plugings that are used by the app. This is different from a default project generated by the ionic CLI. That is because if the `includePlugins` section is not available, the Capacitor CLI would enumerate the `@capacitor` packages from `package.json` and copy those plugins into the generate mobile app project. If we allow the CLI to do this, it would result in the core capacitor plugins being installed in the app's `node_modules` folder which would break our fundamental objective -- one package repository for all projects within the monorepo. We get around this by expilicitly listing the plugins that the app uses so that the CLI does not go to the fallback process. In some ways this is also quite useful as if two apps within the monorepo use different plugins, you can control that via the `includePlugins` section of the apps' `capacitor.config.ts`.

   Second, we create a `capacitor.config.ts` in the workspace root folder. Why do we need this? When `ionic cap` is run for platform specific commands, the capacitor CLI always checks if the platform folder for the app has been created and if not starts the `ionic cap add <platform>` handler. Unfortunately, even with `--project <project>`, the CLI consults `capacitor.config.ts` from cwd and when not found, it creates the `platform` folder in the workspace directory. If you have two apps, this can cause conflicts. To get around this, we have to maintain a capacitor config file that sets the correct platform folder for the CLI to check. So for app-one, this would look like (what we created earlier):
   ```   
   import { CapacitorConfig } from '@capacitor/cli';

   const config: CapacitorConfig = {
      android: {
         path: './apps/app-one/android'
      }
   };

   export default config;
   ```
   Note the `android:` section. That's the only one that's required. So if you have two apps in your monorepo, you need to keep separate `capacitor-<project>.config.json`, one for each app and use relevant file to copy and create a working `capacitor.config.ts` before executing any `ionic cap ...` command. A small pain, but one that can be addressed quite easily with a tiny script of our own.(See next section)

   I suspect this is a bug and hope Ionic will address this soon. Or I'm doing something wrong and this is a consequence of that mistake.

# [Script to automate root config file creation](#runcap)

Since the `capacitor.config.ts` at workspace root is used purely to prevent the CLI from wrongly creating the platform folder for the project, we can create a small script to act as a wrapper around the `ionic cap` command. All this script would do is read the value of `--project` argument and create a `capacitor.config.ts` with the right android/ios path set. Then it would and launch `ionic cap...` command with all the original arguments passed to it. This way `ionic cap` continues to work as the user would expect it to.

So for example to sync the project you can issue:
```
$ ./runcap sync android --project app-one
```
To run the project with `--livereload`, you can:
```
$ ./runcap run android --livereload --external --project app-one
```
And so on..

# Adding a project
To add a new ionic project, repeat steps 2~7 with the new app name. You can omit step 8 as you can use `./runcap` to manage that process.

# Adding a library
TBD