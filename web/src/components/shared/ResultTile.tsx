import styles from "./ResultTile.module.css";

export const ResultTile = ({
  label,
  value,
  monospace = false,
}: {
  label: string;
  value: string | number;
  monospace?: boolean;
}) => {
  return (
    <article className={styles.tile}>
      <span className={styles.label}>{label}</span>
      <span className={`${styles.value} ${monospace ? styles.monospace : ""}`}>{value}</span>
    </article>
  );
};
