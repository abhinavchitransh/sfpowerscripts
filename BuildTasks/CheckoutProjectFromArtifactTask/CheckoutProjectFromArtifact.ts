import tl = require("azure-pipelines-task-lib/task");
var fs = require("fs-extra");
const path = require("path");
import simplegit from "simple-git/promise";
import { AppInsights } from "../Common/AppInsights";

async function run() {
  try {
    AppInsights.setupAppInsights(tl.getBoolInput("isTelemetryEnabled", true));

    const artifact = tl.getInput("artifact", true);
    const artifact_type = tl.getInput("typeOfArtifact", true);
    let version_control_provider: string;
    let token;
    let username: string;

    if (artifact_type != "delta") {
      version_control_provider = tl.getInput("versionControlProvider", true);

      let connection: string;
      switch (version_control_provider) {
        case "github":
          connection = tl.getInput("github_connection", true);
          break;
        case "githubEnterprise":
          connection = tl.getInput("github_enterprise_connection", true);
          break;
        case "bitbucket":
          connection = tl.getInput("bitbucket_connection", true);
          break;
      }

      if (version_control_provider == "azureRepo") {
        token = tl.getVariable("system.accessToken");
      } else if (
        version_control_provider == "github" ||
        version_control_provider == "githubEnterprise"
      ) {
        token = tl.getEndpointAuthorizationParameter(
          connection,
          "AccessToken",
          true
        );
      } else if (version_control_provider == "bitbucket") {
        token = tl.getEndpointAuthorizationParameter(
          connection,
          "AccessToken",
          true
        );
      } else {
        username = tl.getInput("username", true);
        token = tl.getInput("password", true);
      }
    }

    let artifact_directory = tl.getVariable("system.artifactsDirectory");

    let package_version_id_file_path = path.join(
      artifact_directory,
      artifact,
      "sfpowerkit_artifact",
      "artifact_metadata"
    );

    let package_metadata_json = fs
      .readFileSync(package_version_id_file_path)
      .toString();

    let package_metadata = JSON.parse(package_metadata_json);

    console.log(package_metadata);

    let local_source_directory = path.join(
      artifact_directory,
      artifact,
      "source"
    );

    fs.mkdirSync(local_source_directory, { recursive: true });

    console.log(`Source Directory created at ${local_source_directory}`);

    tl.debug(package_metadata.package_type);
    console.log(package_metadata.package_type);

    if (
      package_metadata.package_type === "source" ||
      package_metadata.package_type === "unlocked"
    ) {
      //Strinp https
      const removeHttps = input => input.replace(/^https?:\/\//, "");

      let repository_url = removeHttps(package_metadata.repository_url);

      const git = simplegit(local_source_directory);

      let remote: string;
      if (
        version_control_provider == "bitbucket" ||
        version_control_provider == "azureRepo"
      ) {
        remote = `https://x-token-auth:${token}@${repository_url}`;
      } else if (
        version_control_provider == "github" ||
        version_control_provider == "githubEnterprise"
      ) {
        remote = `https://${token}:x-oauth-basic@${repository_url}`;
      } else if (version_control_provider == "otherGit") {
        remote = `https://${username}:${token}@${repository_url}`;
      }

      await git.silent(false).clone(remote, local_source_directory);
      await git.checkout(package_metadata.sourceVersion);

      console.log(`Checked Out ${package_metadata.sourceVersion} sucessfully`);
    } else if (package_metadata.package_type === "delta") {
      let delta_artifact_location = path.join(
        artifact_directory,
        artifact,
        "sfpowerscripts_delta_package"
      );

      tl.debug(`Delta Directory is at ${delta_artifact_location}`);

      tl.debug("Files in Delta Location");
      fs.readdirSync(delta_artifact_location).forEach(file => {
        tl.debug(file);
      });

      tl.debug("Copying Files to a proper directory");
      fs.copySync(delta_artifact_location, local_source_directory,{
        overwrite: true
      });
    }

    console.log("Files in source Location");
    fs.readdirSync(local_source_directory).forEach(file => {
      console.log(file);
    });

    tl.setVariable("sfpowerscripts_checked_out_path", local_source_directory);

    AppInsights.trackTask("sfpwowerscript-checkoutprojectfromartifact-task");
    AppInsights.trackTaskEvent(
      "sfpwowerscript-checkoutprojectfromartifact-task",
      "project_checked_out"
    );
  } catch (err) {
    AppInsights.trackExcepiton(
      "sfpwowerscripts-checkoutprojectfromartifact-task",
      err
    );
    tl.setResult(tl.TaskResult.Failed, err.message);
  }
}

run();
