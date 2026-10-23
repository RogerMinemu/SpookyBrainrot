import pytest

from app.content import WORDLE_WORDS
from app.core.puzzle import ActionRejected
from app.puzzles.cursed_wordle import ABSENT, CORRECT, PRESENT, normalize, score
from tests.test_wordle_turns import Rig


def test_duplicate_scoring_exact_counts():
    # target KETER: K E T E R ; guess EERIE: E E R I E
    # pass1 correct: idx1 (E==E). remaining counts: K1 T1 E1(idx3) R1
    # idx0 E -> present (E 1 left), idx2 R -> present, idx3 I -> absent, idx4 E -> absent (none left)
    assert score("KETER", "EERIE") == [PRESENT, CORRECT, PRESENT, ABSENT, ABSENT]


def test_all_correct_and_all_absent():
    assert score("SAHUR", "SAHUR") == [CORRECT] * 5
    assert score("SAHUR", "BBBBB") == [ABSENT] * 5


def test_extra_guess_letter_not_marked_present_twice():
    assert score("ABCDE", "AAAAA") == [CORRECT, ABSENT, ABSENT, ABSENT, ABSENT]


def test_normalize_strips_accents_and_uppercases():
    assert normalize(" sahúr ") == "SAHUR"
    assert normalize("niño") == "NINO"


@pytest.mark.parametrize("bad", ["", "ab1de", "ab de", "sah-r", 12, None])
def test_normalize_rejects_non_alpha(bad):
    with pytest.raises(ActionRejected) as e:
        normalize(bad)
    assert e.value.code == "bad_word"


def test_wrong_length_rejected_without_consuming_attempt():
    r = Rig(words=["SAHUR"])
    with pytest.raises(ActionRejected) as e:
        r.guess("A", "SMILER")
    assert e.value.code == "bad_length"
    assert r.s.attempts == []
    with pytest.raises(ActionRejected):
        r.guess("A", "ab1de")
    assert r.s.attempts == []


def test_lore_list_only_five_or_six_letters():
    assert WORDLE_WORDS and all(5 <= len(w) <= 6 and w.isalpha() and w.isupper() for w in WORDLE_WORDS)
    for w in ("NOCLIP", "SMILER", "KETER", "SAHUR"):
        assert w in WORDLE_WORDS
