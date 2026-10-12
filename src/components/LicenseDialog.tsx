import { Modal } from "./Modal";
import { useT } from "../i18n";

/**
 * The licence notice, as the About dialog's second tab in the original.
 *
 * The text is deliberately not translated: it is a legal notice, and a
 * translation of one is not the notice. Everything else in this app is.
 */
const NOTICE = `transgui-next
Copyright (C) 2026 tk1n

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 2 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program; if not, write to the Free Software
Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston,
MA 02110-1301 USA.

It is a rewrite of Transmission Remote GUI (transgui) by Yury Sidorov
and contributors, which is distributed under the same licence.`;

export function LicenseDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Modal
      title={t("License")}
      onClose={onClose}
      width={560}
      footer={
        <button className="btn primary" onClick={onClose}>
          {t("Close")}
        </button>
      }
    >
      <pre className="license-text">{NOTICE}</pre>
    </Modal>
  );
}
