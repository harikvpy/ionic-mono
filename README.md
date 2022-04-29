# Ionic/Capacitor Monorepo

This is a sample repository that shows how to setup a monorepo for building multiple Ionic Angular apps. Specifically, it has two apps -- community & admin and a shared library that is used by both. The shared library has a subentry point, which in turn is used by the core library.

# Background

## Official Docs
My first attempt at setting up a monorepo was following the official documentation on Ionic's website. There are really two pieces that point to this -- the CLI [doc](https://ionicframework.com/docs/cli/configuration#multi-app-projects) on multi-apps and a related [Wiki](https://github.com/ionic-team/ionic-cli/wiki/Angular-Monorepo) page. Unfortunately, the two 'official' pieces of documentation are not really synced very well. Whereas the CLI doc shows the basics of running the CLI for a multi-app project, the latter uses the Angular CLI to set things up.

Overall the Wiki page looks more thorough, but it only shows the setup for a project consisting of an app and a web page. Trying to extend it support multiple apps, one will face the issue of the platform output folder for the two apps conflicting with each other.

Finally, any monorepo project would involve a library for sharing common code between the multiple apps.

## Using NX

One way to address the above is to use (NX)[https://nx.dev/] to setup the project environment and manage the build. There's an NX Ionic (plugin)(https://nxtend.dev/docs/ionic-angular/overview) to help with this, which works somewhat well. Until you need to use the `--livereload` to test the fine changes to the app code on a device. Unfortunately I couldn't find a reliable way to get this working.

NX is quite impressive in what it can do and how it can speed up your build times. But with it's Ionic plugin not being official and seeing some inactivity in its repo coupled with the issue above, it was time to try and see if one can configure a monorepo with nothing but the official tools -- Angular and Ionic CLIs.

# Solution
The following steps outline the process involved in setting up a monorepo for building multiple Ionic apps.

1. Create a new empty Angular workspace
   ```
   $ ng new --create-application=false --new-project-root='apps' ionic-mono
   $ cd ionic-mono
   ```
2. Initialize the folder for Ionic multi-app configuration
   ```
   $ ionic init --multip-app
   ```
3. Generate a new Ionic app using Angular CLI and add ionic to it.
   ```
   $ ng generate application --prefix=app --routing --style=sass app-one
   $ ng add @ionic/angular --project=app-one
   ```
4. Initialize the generated ionic app
   ```
   $ cd apps/app-one
   $ ionic init app --type=angular --default --project-id=app-one
   ```
5. Enable capacitor integrations for the app. (from workspace folder)
   ```
   $ cd ../..
   $ ionic integrations enable capacitor --project=app-one
   ```
6. By default angular is configured to send app build output to go to `dist/<app_name>` folder. We want to change it to `dist/apps/<app_name>` so that `dist/` folder structure mimics the project folder structure. So create dist folder for the ionic build output first. After this update the project's `outputPath` in `angular.json` replacing `dist/app-one` with `dist/apps/app-one`.
   ```
   $ mkdir -p dist/apps/app-one
   ```
7. Rightfully this should be enough to build `app-one`. However, if you issue `ionic build --project app-one` now, you will get the error
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
   Build the project from workspace root folder. 
   ```
   $ ionic build --project app-one
   ```
   You should see build output in `dist/apps/app-one`. You'll also notice that `node_modules` is created under `apps/app-one`. This is where NPM caches the dependencies build output, ostensibly to speed future builds. At this stage create `.gitignore` in `apps/app-one` to exclude `node_modules` from the Git repo.

8. Now comes the tricky part. With ionic project setup for multi-app, one would expect capacitor CLI to read these settings from ionic.
   config.json and work accordingly. However my experience was different. If you have only one mobile app in you repo and the other is a web app, all is well. But if you have two mobile apps, you will find that both send their mobile app outputs to the same folder. To get around this, we create `capacitor.config.ts` for each project within its own folder. So we create `apps/app-one/capacitor.config.ts` and if you have `apps/app-two`, `apps/app-two/capacitor.config.ts`.
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
   You'll also notice that the various capacitor plugins are explicitly listed here. In a default project generated by the ionic CLI, you won't find this. If the `includePlugins` section is not available, CLI would enumerate the `@capacitor` packages from `package.json` and copy those plugins into the generate mobile app project. This step would result in these plugins being installed in the app's `node_modules` folder which would break our fundamental objective -- one package repository for all projects within the monorepo. We get around this by expilicitly listing the plugins that the app uses. In some ways this is also quite useful as if two apps within the monorepo use different plugins, you can control that via the `includePlugins` section of the apps' `capacitor.config.ts`.

   Lastly, we need to create a `capacitor.config.ts` in workspace root as well. Why do we need this? When `ionic cap` is run for platform specific commands, the capacitor CLI always checks if the platform folder for the app has been created and if not starts the `ionic cap add <platform>` handler. Unfortunately, even with `--project <project>`, the CLI consults `capacitor.config.ts` from cwd and when not found, it creates the `platform` folder in the workspace directory. If you have two apps, this can cause conflicts. To get around this, we have to maintain a capacitor config file that sets the correct platform folder for the CLI to check. So for app-one, this would look like:
   ```   
   import { CapacitorConfig } from '@capacitor/cli';

   const config: CapacitorConfig = {
      android: {
         path: './apps/app-one/android'
      }
   };

   export default config;
   ```
   Note the `android:` section. That's the only one that's required. So if you have two apps in your monorepo, you need to keep separate `capacitor-<project>.config.json`, one for each app and use that to create `capacitor.config.ts` before executing any `ionic cap ...` command.

   I suspect this is a bug and hope Ionic will address this soon. Or I'm doing something wrong and this is a consequence of that mistake.

# Script to automate step 8

Since the `capacitor.config.ts` at workspace root is used purely to control the CLI from wrongly creating the platform folder for the project, we can create a small script to act as a wrapper around the `ionic cap` command. All this script would do is to depending on the value of `--project` create a `capacitor.config.ts` and launch `ionic cap...` command with all the other args intact. This way `ionic cap` continues to work as the user would expect it to.

To use the script