// parse command line options
var minimist = require("minimist");
var mopts = {
  string: ["version", "stage", "taskId"],
  boolean: ["public"]
};

var options = minimist(process.argv, mopts);

// remove well-known parameters from argv before loading make
process.argv = options._;

// modules
var shell = require("shelljs");
var make = require("shelljs/make");
var path = require("path");
var os = require("os");
var cp = require("child_process");
var fs = require("fs");
var semver = require("semver");
var rimraf = require("rimraf");
var tl = require("azure-pipelines-task-lib/task");

// global paths
var sourcePath = path.join(__dirname, "BuildTasks");
var assetPath =  path.join(__dirname,"static");
var widgetsPath = path.join(__dirname,"Widgets");
var binariesPath = path.join(__dirname, "build");
var packagesPath = path.join(__dirname, "dist");

var version;

// make targets
target.clean = function() {
  console.log("clean: cleaning binaries");

  shell.rm("-Rf", binariesPath);
  shell.mkdir("-p", binariesPath);
};

target.copy = function() {
  target.clean();

  //copy directory
  var taskOutputPath = path.join(binariesPath, "BuildTasks");
  var assetOutputPath = path.join(binariesPath,"static");
  
  console.log("copy: copy task");
  copyRecursiveSync(sourcePath, taskOutputPath);
  
  console.log("copy: copy assets");
  copyRecursiveSync(assetPath, assetOutputPath);

  // rimraf.sync(taskOutputPath + "/**/**/*.ts");

  // copy external modules
  console.log("build: copying externals modules");
  // getExternalModules(binariesPath);

  // copy resources
  console.log("build: copying resources");
  [
    "README.md",
    "LICENSE.txt",
    "tslint.json",
    "vss-extension.json"
  ].forEach(function(file) {
    shell.cp("-Rf", path.join(__dirname, file), binariesPath);
    console.log("  " + file + " -> " + path.join(binariesPath, file));
  });

  shell.cp("-Rf", path.join(__dirname, "*.png"), binariesPath);
  console.log("  images copied");
};

target.incrementversion = function() {
 
   //Reading current versions from manifest
   var manifestPath = path.join(__dirname, "vss-extension.json");
   var manifest = JSON.parse(fs.readFileSync(manifestPath));


  


  if (options.version) {
    if (options.version === "auto") {
      var ref = new Date(2000, 1, 1);
      var now = new Date();
      var major = semver.major(manifest.version);
      var minor = Math.floor((now - ref) / 86400000);
      var patch = Math.floor(
        Math.floor(
          now.getSeconds() + 60 * (now.getMinutes() + 60 * now.getHours())
        ) * 0.5
      );
      options.version = major + "." + minor + "." + patch;
    }
    else if (options.version === "dev")
    {

  
      //Treat patch as the build number, let major and minor be developer controlled
      var major = semver.major(manifest.version);
      var minor = semver.minor(manifest.version);
      var patch = semver.patch(manifest.version);
      patch+=1;
      options.version = major + "." + minor + "." + patch;

      
    }

    if (!semver.valid(options.version)) {
      console.error("package", "Invalid semver version: " + options.version);
      process.exit(1);
    }
  }
 

  switch (options.stage) {
    case "dev":
      options.public = false;
      updateExtensionManifest(__dirname, options, false);
      tl.updateBuildNumber(options.version);
      break;
    case "review":
      options.public = false;
      updateExtensionManifest(__dirname, options, false);
      tl.updateBuildNumber(options.version);
      break;
    default:
      updateExtensionManifest(__dirname, options, true);
  }

 
};



target.publish = function() {
  console.log("publish: publish task");

  console.log(options);

  if (options.stage == "dev") {
    shell.exec(
      'tfx extension publish --vsix "' +
        packagesPath +
        "/AzlamSalam.sfpowerscripts-dev-" +
        options.version +
        '.vsix"' +
        " --share-with azlamsalam --token " +
        options.token
    );
  } else if (options.stage == "review") {
   
      //Reading current versions from manifest
   var manifestPath = path.join(__dirname, "vss-extension.json");
   var manifest = JSON.parse(fs.readFileSync(manifestPath));
   options.version = manifest.version;


    shell.exec(
      'tfx extension publish --vsix "' +
        packagesPath +
        "/AzlamSalam.sfpowerscripts-review-" +
        options.version +
        '.vsix"' +
        " --share-with safebot --token " +
        options.token
    );
  } else {
    updateExtensionManifest(__dirname, options, true);
    console.log(`version found ${version}`);
    console.log(`Package Path found ${packagesPath}`);

    shell.exec(
      'tfx extension publish --vsix "' +
        packagesPath +
        "/AzlamSalam.sfpowerscripts-" +
        version +
        '.vsix"' +
        " --token " +
        options.token
    );
  }
};

updateExtensionManifest = function(dir, options, isOriginalFile) {

  console.log(`Setting Version to  ${options.version}`);

  var manifestPath = path.join(dir, "vss-extension.json");
  var manifest = JSON.parse(fs.readFileSync(manifestPath));

  if (options.stage == "dev" && !isOriginalFile) {
    manifest.version = options.version;
    manifest.id = "sfpowerscripts" + "-" + "dev";
    manifest.name = "sfpowerscripts" + " (" + "dev" + ")";
    manifest.public = false;
  } else if (options.stage == "review" && !isOriginalFile) {
    manifest.version = options.version;
    manifest.id = "sfpowerscripts" + "-" + "review";
    manifest.name = "sfpowerscripts" + " (" + "review" + ")";
    manifest.public = false;
    manifest.baseUri= "https://localhost:3000/build/";
  } else {
    manifest.id = "sfpowerscripts";
    manifest.name = "sfpowerscripts";
    manifest.public = true;
    version = manifest.version;
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4));
};

updateTaskManifest = function(dir, options, isOriginalFile) {
  var tasksPath = path.join(dir, "BuildTasks");
  var tasks = fs.readdirSync(tasksPath);
  console.log(tasks.length + " tasks found.");
  tasks.forEach(function(task) {
    var manifestPath = path.join(tasksPath, task, "task.json");

    if (fs.existsSync(manifestPath)) {
      console.log(manifestPath);
      var manifest = JSON.parse(fs.readFileSync(manifestPath));

      if (options.stage && !isOriginalFile) {
        manifest.friendlyName = manifest.friendlyName + " (" + options.stage;

        if (options.version) {
          manifest.friendlyName = manifest.friendlyName + " " + options.version;
        }

        manifest.friendlyName = manifest.friendlyName + ")";
      }

      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4));
    }
  });
};


copyRecursiveSync = function(src, dest) {
  var exists = fs.existsSync(src);
  if (exists) {
    var stats = fs.statSync(src);
    var isDirectory = stats.isDirectory();
    if (isDirectory) {
      exists = fs.existsSync(dest);
      if (!exists) {
        fs.mkdirSync(dest);
      }
      fs.readdirSync(src).forEach(function(childItemName) {
        copyRecursiveSync(
          path.join(src, childItemName),
          path.join(dest, childItemName)
        );
      });
    } else {
      fs.copyFileSync(src, dest);
    }
  }
};
