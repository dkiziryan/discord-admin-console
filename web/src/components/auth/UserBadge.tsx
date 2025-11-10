import styles from "./UserBadge.module.css";
import type { AuthUser } from "../../services/auth/auth";

export const UserBadge = ({
  user,
  onLogout,
}: {
  user: AuthUser;
  onLogout: () => void;
}) => (
  <div className={styles.badge}>
    {user.avatarUrl && (
      <img src={user.avatarUrl} alt="" className={styles.avatar} />
    )}
    <div>
      <span className={styles.label}>Signed in as</span>
      <strong>{user.username}</strong>
    </div>
    <button type="button" onClick={onLogout}>
      Logout
    </button>
  </div>
);
