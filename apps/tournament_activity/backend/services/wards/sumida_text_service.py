"""
墨田区専用 テキスト申込書サービス

墨田区は申込書をテキストで送付する運用のため、Excelではなくテキストを生成する。

団体戦（classification=1、申込1件＝1チーム）:
    チーム名: 十条クラブ（固定）
    各選手: 氏名 / 所属クラブ名（固定） / 生年月日 / 電話番号

個人戦（classification=0、申込1件＝1ペア）:
    ■種別（例: ■一般女子）
    十条クラブ（複数ペア時は 十条クラブ①、十条クラブ② と連番）
    各選手（ペア内は五十音順）:
        氏名（ふりがな）
        生年月日（例: 2003年10月1日）
        電話番号（ハイフン区切り）
"""
import unicodedata
from datetime import datetime, date
from typing import List, Dict, Optional


# 複数ペア時のクラブ名連番用の丸数字
CIRCLED_NUMBERS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"


def _circled(n: int) -> str:
    """1始まりの連番を丸数字にする（⑳超は (n) 表記にフォールバック）"""
    if 1 <= n <= len(CIRCLED_NUMBERS):
        return CIRCLED_NUMBERS[n - 1]
    return f"({n})"


def _strip_spaces(s: Optional[str]) -> str:
    """半角・全角スペースを除去（例: '相山 楓' -> '相山楓'）"""
    return (s or "").replace(" ", "").replace("　", "")


def _katakana_to_hiragana(s: Optional[str]) -> str:
    """カタカナをひらがなに変換（フリガナ欄がカタカナ登録でも見本に合わせる）

    半角カタカナ（ｱｲｳ…）はNFKC正規化で全角に揃えてから変換する。
    """
    s = unicodedata.normalize("NFKC", s or "")
    return "".join(
        chr(ord(ch) - 0x60) if "ァ" <= ch <= "ヶ" else ch
        for ch in s
    )


class SumidaTextService:
    """墨田区専用のテキスト申込書生成サービス"""

    ward_id = 7
    ward_name = "墨田区"

    # チーム名・所属クラブ名は固定
    FIXED_TEAM_NAME = "十条クラブ"
    FIXED_CLUB_NAME = "十条クラブ"

    def _format_birth_date(self, birth_date) -> str:
        """生年月日を YYYY/MM/DD 形式に整形"""
        if not birth_date:
            return ""
        if isinstance(birth_date, str):
            try:
                birth_date = datetime.strptime(birth_date[:10], "%Y-%m-%d").date()
            except ValueError:
                return birth_date
        if isinstance(birth_date, (datetime, date)):
            return f"{birth_date.year}/{birth_date.month:02d}/{birth_date.day:02d}"
        return str(birth_date)

    def _format_type_sex(self, type_: Optional[str], sex: Optional[int]) -> str:
        """種別と性別を結合（例: 一般男子）"""
        if type_ is None:
            return ""
        if sex is None:
            return str(type_)
        sex_str = "男子" if sex == 0 else "女子"
        return f"{type_}{sex_str}"

    def build_team_text(self, tournament: Dict, registration: Dict) -> str:
        """
        申込1件（=1チーム）分のテキストを生成

        Args:
            tournament: 大会情報（tournament_mst）
            registration: 申込情報。'members' に選手dictのリストを含むこと。
                各選手dict: player_name / birth_date / phone_number など

        Returns:
            送付用テキスト
        """
        tournament_name = tournament.get("tournament_name", "")
        type_sex = self._format_type_sex(registration.get("type"), registration.get("sex"))

        lines: List[str] = []
        header = f"【墨田区 団体戦申込】{tournament_name}".rstrip()
        if type_sex:
            header += f"（{type_sex}【団体】）"
        lines.append(header)
        lines.append(f"チーム名：{self.FIXED_TEAM_NAME}")
        lines.append("")

        members = registration.get("members", [])
        for idx, player in enumerate(members, start=1):
            if player is None:
                continue
            lines.append(f"{idx}）氏名：{player.get('player_name', '')}")
            lines.append(f"　所属クラブ名：{self.FIXED_CLUB_NAME}")
            lines.append(f"　生年月日：{self._format_birth_date(player.get('birth_date'))}")
            lines.append(f"　電話番号：{player.get('phone_number', '')}")
            lines.append("")

        return "\n".join(lines).rstrip()

    def _format_birth_date_jp(self, birth_date) -> str:
        """生年月日を和文形式に整形（例: 2003年10月1日。ゼロ埋めなし）"""
        if not birth_date:
            return ""
        if isinstance(birth_date, str):
            try:
                birth_date = datetime.strptime(birth_date[:10], "%Y-%m-%d").date()
            except ValueError:
                return birth_date
        if isinstance(birth_date, (datetime, date)):
            return f"{birth_date.year}年{birth_date.month}月{birth_date.day}日"
        return str(birth_date)

    def _format_phone(self, phone) -> str:
        """電話番号をハイフン区切りに整形（例: 08088162335 -> 080-8816-2335）"""
        # 全角数字・全角ハイフン等をNFKCで半角に正規化
        s = unicodedata.normalize("NFKC", str(phone or "")).strip()
        if "-" in s:
            return s
        digits = "".join(c for c in s if c.isdigit())
        if len(digits) == 11:
            return f"{digits[:3]}-{digits[3:7]}-{digits[7:]}"
        if len(digits) == 10:
            # 東京03・大阪06などの2桁市外局番は 2-4-4、それ以外は 3-3-4
            if digits.startswith(("03", "06")):
                return f"{digits[:2]}-{digits[2:6]}-{digits[6:]}"
            return f"{digits[:3]}-{digits[3:6]}-{digits[6:]}"
        return s

    def _player_kana_key(self, player: Dict) -> str:
        """ペア内の並び順（五十音順）用キー。ふりがな未登録なら氏名で代用"""
        kana = player.get("player_name_kana") or player.get("player_name") or ""
        return _strip_spaces(_katakana_to_hiragana(kana))

    def _format_individual_player(self, player: Dict) -> List[str]:
        """個人戦の選手1名分の行（氏名（ふりがな）/ 生年月日 / 電話番号）"""
        name = _strip_spaces(player.get("player_name"))
        kana = _strip_spaces(_katakana_to_hiragana(player.get("player_name_kana")))
        name_line = f"{name}（{kana}）" if kana else name
        return [
            name_line,
            self._format_birth_date_jp(player.get("birth_date")),
            self._format_phone(player.get("phone_number")),
        ]

    def build_individual_text(self, type_sex: str, registrations: List[Dict]) -> str:
        """
        個人戦: 1種別分のテキストを生成

        ペアごとにクラブ名（複数ペア時は丸数字連番）と選手（五十音順）を列挙する。

        Args:
            type_sex: 種別表示（例: 一般女子）
            registrations: この種別の申込データ（'members' を含む）のリスト
        """
        lines: List[str] = [f"■{type_sex}"]
        multiple = len(registrations) > 1
        for idx, reg in enumerate(registrations, start=1):
            club = self.FIXED_CLUB_NAME + (_circled(idx) if multiple else "")
            lines.append(club)
            members = sorted(
                (m for m in reg.get("members", []) if m),
                key=self._player_kana_key,
            )
            for player in members:
                lines.append("")
                lines.extend(self._format_individual_player(player))
            lines.append("")
        return "\n".join(lines).rstrip()

    def build_texts(self, tournament: Dict, registrations: List[Dict]) -> List[str]:
        """
        全申込分のテキストブロックをリストで生成

        団体戦（classification=1）: 1チーム1ブロック
        個人戦（それ以外）: 大会名ヘッダー1ブロック＋種別ごとに1ブロック

        Args:
            tournament: 大会情報
            registrations: 'members' を含む申込データのリスト

        Returns:
            テキストブロックのリスト（Discordメッセージ単位）
        """
        if tournament.get("classification") == 1:
            texts: List[str] = []
            for reg in registrations:
                text = self.build_team_text(tournament, reg)
                if text:
                    texts.append(text)
            return texts

        # 個人戦: 種別（性別→種別）ごとにグループ化して男子→女子の順で出力
        groups: Dict[tuple, List[Dict]] = {}
        for reg in registrations:
            key = (
                reg.get("sex") if reg.get("sex") is not None else 0,
                str(reg.get("type") or ""),
            )
            groups.setdefault(key, []).append(reg)

        texts = [f"【墨田区 個人戦申込】{tournament.get('tournament_name', '')}".rstrip()]
        for sex, type_ in sorted(groups.keys()):
            regs = sorted(
                groups[(sex, type_)],
                key=lambda r: r.get("registration_id") or 0,
            )
            block = self.build_individual_text(self._format_type_sex(type_, sex), regs)
            if block:
                texts.append(block)
        return texts
