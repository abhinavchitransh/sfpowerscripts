import child_process = require("child_process");
import { onExit } from "../Common/OnExit";

export default class PromoteUnlockedPackageImpl {
  public constructor(private package_version_id: string, private devhub_alias: string) {}

  public async exec(): Promise<void> {
    let command = await this.buildExecCommand();

    let child = child_process.exec(command, (error, stdout, stderr) => {
      if (error) throw error;
    });

    child.stdout.on("data", data => {
      console.log(data.toString());
    });

    await onExit(child);
  }

  public async buildExecCommand(): Promise<string> {
    let command = `npx sfdx force:package:version:promote -v ${this.devhub_alias}`;
    //package
    command += ` -p ${this.package_version_id}`;

    return command;
  }
}
