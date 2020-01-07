import tl = require("azure-pipelines-task-lib/task");
import child_process = require("child_process");
import DeleteScratchOrgImpl from "./DeleteScratchOrgImpl";
import CreateScratchOrgImpl from "./CreateScratchOrgImpl";
import FileSystemInteractions from "../Common/FileSystemInteractions";
import fs = require("fs");
import path = require("path");

import { AppInsights } from "../Common/AppInsights";

async function run() {
  try {
    const action: string = tl.getInput("action", true);
    const devhub_alias: string = tl.getInput("devhub_alias", true);

    AppInsights.setupAppInsights(tl.getBoolInput("isTelemetryEnabled", true));

    if (action == "Create") {
      console.log("SFPowerScript.. Create a scratch org");
      const alias: string = tl.getInput("alias", true);
      const config_file_path: string = tl.getInput("config_file_path", true);
      const working_directory: string = tl.getInput("working_directory", false);
      const maintainorg = tl.getInput("maintainorg", true);

      let daysToMaintain = 1;
      if (maintainorg == "maintain") {
        daysToMaintain = Number.parseInt(tl.getInput("daystomanintain", true));
      }

      let createScratchOrg: CreateScratchOrgImpl = new CreateScratchOrgImpl(
        working_directory,
        config_file_path,
        devhub_alias,
        alias,
        daysToMaintain
      );
      console.log("Generating Create Scratch Org command");
      let createCommand = await createScratchOrg.buildExecCommand();
      tl.debug(createCommand);

      let result = await createScratchOrg.exec(createCommand);

      tl.setTaskVariable(
        "sfpowerscripts_scratch_org_username",
        result.result.username,
        false
      );

      console.log(
        `Successfully created a scratch org with devhub ${devhub_alias} , The username  is ${result.result.username}`
      );

      //Open up the scratch org to get the URL
      console.log(`Opening up the created scratch org to retrieve URL`);
      result = child_process.execSync(`npx sfdx force:org:open -r --json`, {
        cwd: working_directory,
        encoding: "utf8"
      });
      tl.debug(result);
      let resultAsJSON = JSON.parse(result);
      tl.setTaskVariable(
        "sfpowerscripts_scratch_org_url",
        resultAsJSON.result.url,
        false
      );

      //Create Summary

      console.log(
        `Successfully retrieved scratch org url ${resultAsJSON.result.url}`
      );

      if (maintainorg == "maintain")
        createSummaryMarkup(
          resultAsJSON.result.url,
          new Date(Date.now()).toISOString(),
          getExpiryDate(daysToMaintain)
        );

      AppInsights.trackTaskEvent(
        "sfpwowerscript-managescratchorg-task",
        "scratchorg_created"
      );
    } else {
      console.log("SFPowerScript.. Delete a scratch org");

      const target_org: string = tl.getInput("target_org", true);

      let deleteScratchOrgImpl: DeleteScratchOrgImpl = new DeleteScratchOrgImpl(
        target_org,
        devhub_alias
      );
      console.log("Generating Delete Scratch Org command");
      let command = await deleteScratchOrgImpl.buildExecCommand();
      tl.debug(command);
      await deleteScratchOrgImpl.exec(command);

      AppInsights.trackTaskEvent(
        "sfpwowerscript-managescratchorg-task",
        "scratchorg_deleted"
      );
    }

    AppInsights.trackTask("sfpwowerscript-managescratchorg-task");
  } catch (err) {
    AppInsights.trackExcepiton("sfpwowerscript-managescratchorg-task", err);
    tl.setResult(tl.TaskResult.Failed, err.message);
  }
}

function getExpiryDate(daysToMaintain: number): string {
  let currentDate: Date = new Date(Date.now());
  let expiryDate: Date = new Date();
  expiryDate.setDate(currentDate.getDate() + daysToMaintain);

  return expiryDate.toISOString();
}
function createSummaryMarkup(
  scratchOrgURL: string,
  createdDate: string,
  expiresOn: string
) {
  let stagingDir: string = path.join(
    tl.getVariable("build.artifactStagingDirectory"),
    ".reviewapp"
  );

  if (scratchOrgURL != null) {
    let summary = `[Scratch Org Link](${scratchOrgURL}) <br/> Created on ${createdDate} <br/> Expires on ${expiresOn}`;
    let buildSummaryFilePath: string = path.join(
      stagingDir,
      "ScratchOrgURL.md"
    );
    FileSystemInteractions.createDirectory(stagingDir);
    fs.writeFileSync(buildSummaryFilePath, summary);

    tl.command(
      "task.addattachment",
      {
        type: "Distributedtask.Core.Summary",
        name: "Scratch Org for Review"
      },
      buildSummaryFilePath
    );
  }
}

run();
