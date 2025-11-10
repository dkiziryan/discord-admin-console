import styles from "./AdminDashboard.module.css";

export const BotInviteCallout = ({
  botInviteUrl,
}: {
  botInviteUrl: string;
}) => (
  <div className={styles.inviteCallout}>
    <p className={styles.inviteEyebrow}>Prerequisite</p>
    <h2>Add the bot to your server</h2>
    <p>
      The dashboard can only manage servers where the bot is installed. Add it
      first, then sign in with a Discord account that has server management
      permissions.
    </p>
    <a
      className={styles.inviteLink}
      href={botInviteUrl}
      target="_blank"
      rel="noreferrer"
    >
      Invite bot to server
    </a>
  </div>
);
