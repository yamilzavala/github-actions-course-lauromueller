const core = require('@actions/core');
const exec = require('@actions/exec');
const github = require('@actions/github');

const setupGit = async () => {
  await exec.exec(`git config --global user.name "gh-automation"`);
  await exec.exec(`git config --global user.email "gh-automation@email.com"`);
}

const validateBranchName = ({ branchName }) =>
  /^[a-zA-Z0-9_\-\.\/]+$/.test(branchName);
const validateDirectoryName = ({ dirName }) =>
  /^[a-zA-Z0-9_\-\/]+$/.test(dirName);

const setupLogger = ({debug, prefix}) => ({
  debug: (message) => {
    if(debug) {
      core.info(`DEBUG ${prefix}${prefix ? ' : ' : ''}${message}`);
    }
  },
  info: (message) => {
      core.info(`${prefix}${prefix ? ' : ' : ''}${message}`);
  },
  error: (message) => {
    if(debug) {
      core.error(`${prefix}${prefix ? ' : ' : ''}${message}`);
    }
  },
})

async function run() {
  const baseBranch = core.getInput('base-branch', { required: true });
  // const targetBranch = core.getInput('target-branch', { required: true });
  // const headBranch = core.getInput('headBranch') || targetBranch;
  const headBranch = core.getInput('headBranch', {required: true});
  const ghToken = core.getInput('gh-token', { required: true });
  const workingDir = core.getInput('working-dir', { required: true });
  const debug = core.getBooleanInput('debug');
  const logger = setupLogger({debug, prefix: '[js-dependency-update]'})

  const commonExecOpts = {
    cwd: workingDir,
  };
  core.setSecret(ghToken);

 logger.debug('Validating inputs base-branch, head-branch, working-directory');

  if (!validateBranchName({ branchName: baseBranch })) {
    core.setFailed(
      'Invalid base-branch name. Branch names should include only characters, numbers, hyphens, underscores, dots, and forward slashes.'
    );
    return;
  }

  if (!validateBranchName({ branchName: headBranch })) {
    core.setFailed(
      'Invalid target-branch name. Branch names should include only characters, numbers, hyphens, underscores, dots, and forward slashes.'
    );
    return;
  }

  if (!validateDirectoryName({ dirName: workingDir })) {
    core.setFailed(
      'Invalid working directory name. Directory names should include only characters, numbers, hyphens, underscores, and forward slashes.'
    );
    return;
  }

  logger.debug(`Base branch is ${baseBranch}`);
  logger.debug(`Target branch is ${headBranch}`);
  logger.debug(`Working directory is ${workingDir}`);

  logger.debug('Checking for package updates');
  await exec.exec('npm update', [], {
    ...commonExecOpts,
  });

  const gitStatus = await exec.getExecOutput(
    'git status -s package*.json',
    [],
    {
      ...commonExecOpts,
    }
  );

  if (gitStatus.stdout.length > 0) {
    logger.debug('There are updates available!');
    logger.debug('Setting up git');
    setupGit()

    logger.debug('Committing and pushing package*.json changes');
    await exec.exec(`git checkout -b ${headBranch}`, [], {
      ...commonExecOpts,
    });
    await exec.exec(`git add package.json package-lock.json`, [], {
      ...commonExecOpts,
    });
    await exec.exec(`git commit -m "chore: update dependencies`, [], {
      ...commonExecOpts,
    });
    await exec.exec(`git push -u origin ${headBranch} --force`, [], {
      ...commonExecOpts,
    });

    logger.debug('Fetching octokit API');
    const octokit = github.getOctokit(ghToken);

    try {
      logger.debug(`Creating PR using head branch ${headBranch}`);

      await octokit.rest.pulls.create({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        title: `Update NPM dependencies`,
        body: `This pull request updates NPM packages`,
        base: baseBranch,
        head: headBranch
      });
    } catch (e) {
      logger.error(
        'Something went wrong while creating the PR. Check logs below.'
      );
      core.setFailed(e.message);
      logger.error(e);
    }
  } else {
    logger.info('No updates at this point in time.');
  }
  /*
  [DONE] 1. Parse inputs:
    1.1 base-branch from which to check for updates
    1.2 target-branch to use to create the PR
    1.3 Github Token for authentication purposes (to create PRs)
    1.4 Working directory for which to check for dependencies
  [DONE] 2. Execute the npm update command within the working directory
  [DONE] 3. Check whether there are modified package*.json files
  [DONE] 4. If there are modified files:
    4.1 Add and commit files to the target-branch
    4.2 Create a PR to the base-branch using the octokit API
  [DONE] 5. Otherwise, conclude the custom action
   */

  logger.debug(`Setting updates-available output to ${updatesAvailable}`);
  core.setOutput('updates-available', updatesAvailable);
}

run();